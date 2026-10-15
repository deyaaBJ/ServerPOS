const Admin = require('../models/Admin');
const ActivationCode = require('../models/ActivationCode');
const ActivationRequest = require('../models/ActivationRequest');
const DeviceBinding = require('../models/DeviceBinding');
const License = require('../models/License');
const LicenseAuditLog = require('../models/LicenseAuditLog');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { isCodeExpired, normalizeCode } = require('../utils/code');
const { createAuditLog } = require('../services/auditLogService');

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getLatestClientDetailsForDevice = async (deviceId, currentRequestId = null) => {
  if (!deviceId?.trim()) {
    return { clientName: null, clientPhone: null };
  }

  const filter = {
    deviceId: deviceId.trim(),
    clientName: { $ne: null }
  };

  if (currentRequestId) {
    filter._id = { $ne: currentRequestId };
  }

  const previousRequest = await ActivationRequest.findOne(filter)
    .sort({ approvedAt: -1, createdAt: -1 })
    .select('clientName clientPhone')
    .lean();

  return {
    clientName: previousRequest?.clientName || null,
    clientPhone: previousRequest?.clientPhone || null
  };
};

// A request can be archived once it has ended, but its client details are still
// useful when that same device asks for activation again.  Keep these values as
// suggestions only; the admin can change them in the approval form.
const attachKnownClientDetails = async (requests) => Promise.all(
  requests.map(async (request) => {
    const requestData = typeof request.toObject === 'function'
      ? request.toObject()
      : request;
    const knownClient = await getLatestClientDetailsForDevice(
      requestData.deviceId,
      requestData._id
    );

    return {
      ...requestData,
      knownClientName: knownClient.clientName,
      knownClientPhone: knownClient.clientPhone
    };
  })
);

const refreshExpiredRequestState = async (request) => {
  if (!request?.assignedCode || !request?.completedAt) {
    return request;
  }

  if (!isCodeExpired(request.assignedCode, request.completedAt)) {
    return request;
  }

  await ActivationCode.updateMany(
    {
      requestId: request._id,
      code: normalizeCode(request.assignedCode),
      used: true
    },
    {
      $set: {
        used: false,
        deviceId: null,
        activatedAt: null,
        expiresAt: null,
        lastValidatedAt: null,
        status: 'revoked',
        revokedAt: new Date()
      }
    }
  );

  request.status = 'expired';
  request.rejectedAt = request.rejectedAt || new Date();
  request.rejectionReason = request.rejectionReason || 'Activation expired';
  await request.save();

  return request;
};



const archiveEndedRequestsForDevice = async (deviceId, currentRequestId = null) => {
  // Archive ALL previous requests for this device (except the current one)
  // This ensures only the latest request is shown in the admin panel
  const filter = {
    deviceId: deviceId.trim(),
    isArchived: { $ne: true }
  };

  if (currentRequestId) {
    filter._id = { $ne: currentRequestId };
  }

  await ActivationRequest.updateMany(filter, {
    $set: {
      isArchived: true,
      archivedAt: new Date()
    }
  });
};

const attachDeviceUsageToRequests = async (requests) => {
  if (!requests.length) {
    return [];
  }

  const deviceIds = [...new Set(
    requests
      .map((request) => request.deviceId?.trim())
      .filter(Boolean)
  )];

  const currentRequestIds = requests
    .filter((request) => request.status === 'completed')
    .map((request) => request._id);
  if (!currentRequestIds.length) {
    return requests.map((request) => ({
      ...request.toObject(),
      deviceUsage: { exists: false, activationCount: 0, lastActivatedAt: null }
    }));
  }
  const deviceUsageRows = await ActivationCode.aggregate([
    {
      $match: {
        used: true,
        deviceId: { $in: deviceIds },
        requestId: { $in: currentRequestIds }
      }
    },
    { $sort: { activatedAt: -1, createdAt: -1 } },
    {
      $group: {
        _id: '$deviceId',
        activationCount: { $sum: 1 },
        lastActivatedAt: { $first: '$activatedAt' }
      }
    }
  ]);

  const usageByDeviceId = new Map(
    deviceUsageRows.map((row) => [
      row._id,
      {
        exists: row.activationCount > 0,
        activationCount: row.activationCount,
        lastActivatedAt: row.lastActivatedAt || null
      }
    ])
  );

  return requests.map((request) => {
    const usage = usageByDeviceId.get(request.deviceId) || {
      exists: false,
      activationCount: 0,
      lastActivatedAt: null
    };

    return {
      ...request.toObject(),
      deviceUsage: usage
    };
  });
};



const getActivationLogFilters = async (clientName) => {
  const trimmedName = clientName?.trim();

  if (!trimmedName) {
    return null;
  }

  const matchingRequests = await ActivationRequest.find({
    clientName: { $regex: `^${escapeRegExp(trimmedName)}$`, $options: 'i' }
  })
    .select('_id clientName clientPhone deviceId assignedCode approvedAt completedAt status createdAt updatedAt')
    .lean();

  if (!matchingRequests.length) {
    return { deviceIds: [], clientName: trimmedName };
  }

  return {
    deviceIds: [...new Set(matchingRequests.map((request) => request.deviceId).filter(Boolean))],
    clientName: trimmedName
  };
};

// Login
exports.login = asyncHandler(async (req, res) => {
  const { key } = req.body;

  const admin = await Admin.findOne({ username: 'admin' });
  
  if (!admin) {
    throw new AppError('Admin account not found', 404);
  }

  // Check if account is locked
  if (admin.isLocked()) {
    const remainingTime = Math.ceil((admin.lockUntil - Date.now()) / 60000);
    throw new AppError(`Account locked. Try again in ${remainingTime} minutes`, 423);
  }

  const isValid = await admin.comparePassword(key);

  if (!isValid) {
    await admin.incrementLoginAttempts();
    throw new AppError('Invalid password', 401);
  }

  // Reset login attempts on successful login
  if (admin.loginAttempts > 0) {
    await admin.updateOne({
      $set: { loginAttempts: 0 },
      $unset: { lockUntil: 1 }
    });
  }

  // Set session
  req.session.admin = true;
  req.session.userId = admin._id;
  req.session.loginTime = new Date();

  res.json({ 
    success: true, 
    message: 'Login successful',
    admin: {
      username: admin.username,
      lastChanged: admin.lastChanged
    }
  });
});

// Change password
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const admin = await Admin.findOne({ username: 'admin' });
  
  if (!admin) {
    throw new AppError('Admin not found', 404);
  }

  const isValid = await admin.comparePassword(currentPassword);
  
  if (!isValid) {
    throw new AppError('Current password is incorrect', 401);
  }

  // Check if new password is same as old
  const isSamePassword = await admin.comparePassword(newPassword);
  if (isSamePassword) {
    throw new AppError('New password must be different from current password', 400);
  }

  admin.password = newPassword;
  admin.lastChanged = new Date();
  await admin.save();

  // Destroy session after password change
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
    }
  });

  res.json({ 
    success: true, 
    message: 'Password changed successfully. Please login again.' 
  });
});

// Get stats
exports.getStats = asyncHandler(async (req, res) => {
  res.json({ success: true });
});

exports.getActivationRequests = asyncHandler(async (req, res) => {
  const requests = await ActivationRequest.find({ isArchived: { $ne: true } })
    .sort({ createdAt: -1 })
    .limit(100);

  const refreshedRequests = await Promise.all(
    requests.map((request) => refreshExpiredRequestState(request))
  );

  const requestsWithDeviceUsage = await attachDeviceUsageToRequests(refreshedRequests);
  const requestsWithKnownClients = await attachKnownClientDetails(requestsWithDeviceUsage);

  res.json({
    success: true,
    requests: requestsWithKnownClients
  });
});

exports.getActivationLogs = asyncHandler(async (req, res) => {
  const { clientName } = req.query;
  const filters = await getActivationLogFilters(clientName);

  if (!filters) {
    return res.json({
      success: true,
      logs: [],
      searched: false
    });
  }

  if (!filters.deviceIds.length) {
    return res.json({
      success: true,
      logs: [],
      searched: true,
      clientName: filters.clientName
    });
  }

  const logs = await LicenseAuditLog.find({
    action: 'activate',
    deviceId: { $in: filters.deviceIds }
  })
    .populate('requestId', 'clientName clientPhone deviceId assignedCode approvedAt completedAt status createdAt updatedAt')
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    logs,
    searched: true,
    clientName: filters.clientName
  });
});

exports.approveActivationRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const normalizedCode = normalizeCode(req.body.code);
  const clientName = req.body.clientName?.trim();
  const clientPhone = req.body.clientPhone?.trim() || null;
  const request = await ActivationRequest.findById(requestId);

  if (!request) {
    throw new AppError('Activation request not found', 404);
  }

  await refreshExpiredRequestState(request);

  if (request.status === 'completed') {
    throw new AppError('Activation request is already completed', 400);
  }

  if (!clientName) {
    throw new AppError('Client name is required', 400);
  }

  const approvedAt = new Date();
  await ActivationCode.findOneAndUpdate(
    {
      requestId: request._id
    },
    {
      $set: {
        code: normalizedCode,
        requestId: request._id,
        used: false,
        deviceId: null,
        activatedAt: null,
        expiresAt: null,
        lastValidatedAt: null,
        status: 'active',
        revokedAt: null
      },
      $setOnInsert: {
        createdAt: approvedAt
      }
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );

  request.status = 'approved';
  request.assignedCode = normalizedCode;
  request.clientName = clientName;
  request.clientPhone = clientPhone;
  request.approvedAt = approvedAt;
  request.completedAt = null;
  request.rejectedAt = null;
  request.rejectionReason = null;
  await request.save();

  await archiveEndedRequestsForDevice(request.deviceId, request._id);

  const latestClientDetails = await getLatestClientDetailsForDevice(request.deviceId, request._id);

  res.json({
    success: true,
    message: 'Activation request approved successfully',
    request: {
      ...request.toObject(),
      clientName: request.clientName || latestClientDetails.clientName,
      clientPhone: request.clientPhone || latestClientDetails.clientPhone
    }
  });
});

exports.rejectActivationRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const reason = req.body.reason?.trim() || null;

  const request = await ActivationRequest.findById(requestId);

  if (!request) {
    throw new AppError('Activation request not found', 404);
  }

  if (request.status === 'completed') {
    throw new AppError('Completed activation requests cannot be rejected', 400);
  }

  request.status = 'rejected';
  request.assignedCode = null;
  request.clientName = null;
  request.clientPhone = null;
  request.approvedAt = null;
  request.rejectedAt = new Date();
  request.rejectionReason = reason;
  await request.save();

  res.json({
    success: true,
    message: 'Activation request rejected successfully',
    request
  });
});

exports.deactivateActivationRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const reason = req.body.reason?.trim() || 'Deactivated manually by admin';

  const request = await ActivationRequest.findById(requestId);

  if (!request) {
    throw new AppError('Activation request not found', 404);
  }

  await refreshExpiredRequestState(request);

  if (request.status !== 'completed') {
    throw new AppError('Only completed activation requests can be deactivated', 400);
  }

  const revokedAt = new Date();
  const activationCode = request.assignedCode
    ? await ActivationCode.findOne({
      requestId: request._id,
      code: normalizeCode(request.assignedCode)
    })
    : null;

  const license = request.assignedCode
    ? await License.findOne({ code: normalizeCode(request.assignedCode) })
    : null;

  await ActivationCode.updateMany(
    {
      requestId: request._id,
      deviceId: request.deviceId,
      used: true
    },
    {
      $set: {
        used: false,
        deviceId: null,
        activatedAt: null,
        status: 'revoked',
        revokedAt
      }
    }
  );

  await DeviceBinding.updateMany(
    {
      licenseId: license?._id || null,
      deviceId: request.deviceId
    },
    {
      $set: {
        status: 'revoked',
        notes: reason
      }
    }
  );

  if (license) {
    license.status = 'revoked';
    license.revokedAt = revokedAt;
    license.revokedReason = reason;
    license.revokedBy = req.session?.admin?.username || 'admin';
    license.tokenVersion += 1;
    await license.save();
  }

  if (activationCode) {
    activationCode.used = false;
    activationCode.deviceId = null;
    activationCode.activatedAt = null;
    activationCode.expiresAt = null;
    activationCode.lastValidatedAt = null;
    activationCode.status = 'revoked';
    activationCode.revokedAt = revokedAt;
    await activationCode.save();
  }

  // End any older active request for this device so a previously issued
  // temporary license cannot become the device's current activation again.
  await ActivationRequest.updateMany(
    {
      _id: { $ne: request._id },
      deviceId: request.deviceId,
      status: { $in: ['approved', 'completed'] }
    },
    {
      $set: {
        status: 'deactivated',
        rejectedAt: revokedAt,
        rejectionReason: 'Superseded by a later activation and deactivated'
      }
    }
  );

  request.status = 'deactivated';
  request.rejectedAt = revokedAt;
  request.rejectionReason = reason;
  await request.save();

  res.json({
    success: true,
    message: 'Activation cancelled successfully',
    request
  });
});

exports.archiveActivationRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;

  const request = await ActivationRequest.findById(requestId);

  if (!request) {
    throw new AppError('Activation request not found', 404);
  }

  if (request.status === 'pending') {
    throw new AppError('Pending activation requests cannot be removed', 400);
  }

  if (request.isArchived) {
    return res.json({
      success: true,
      message: 'Activation request already removed from dashboard'
    });
  }

  request.isArchived = true;
  request.archivedAt = new Date();
  await request.save();

  res.json({
    success: true,
    message: 'Activation request removed from dashboard successfully'
  });
});

// Logout
exports.logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: 'Error logging out' 
      });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
};

// Direct device activation (Admin only)
exports.adminActivateDevice = asyncHandler(async (req, res) => {
  const { deviceId, code, licenseType = 'permanent', expiresInDays } = req.body;
  
  // Get or generate activation code
  let activationCode;
  if (code) {
    activationCode = await ActivationCode.findOne({ code: normalizeCode(code) });
    if (!activationCode) {
      throw new AppError('Activation code not found', 404);
    }
  } else {
    // Generate a new code
    const newCode = `ADMIN-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    activationCode = await ActivationCode.create({
      code: newCode,
      used: false,
      requestId: null
    });
  }

  const now = new Date();
  
  // Calculate expiration date
  let expiresAt = null;
  if (licenseType === 'temporary') {
    const daysToAdd = expiresInDays || 30;
    expiresAt = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  }

  // Build policy-like license data
  const licenseData = {
    code: activationCode.code,
    type: licenseType,
    status: 'active',
    expiresAt,
    revalidationIntervalSeconds: 86400, // 24 hours
    offlineGraceSeconds: 604800, // 7 days
    clockSkewToleranceSeconds: 300,
    maxDevices: 1,
    validationCount: 0,
    tokenVersion: 1,
    firstActivatedAt: now,
    lastValidatedAt: now,
    revokedAt: null,
    revokedReason: null,
    revokedBy: null,
    features: []
  };

  // Create or update license
  const license = await License.findOneAndUpdate(
    { code: normalizeCode(activationCode.code) },
    {
      $set: licenseData,
      $setOnInsert: {
        validationCount: 0,
        tokenVersion: 1,
        features: []
      }
    },
    { new: true, upsert: true }
  );

  // Update activation code
  activationCode.used = true;
  activationCode.deviceId = deviceId;
  activationCode.activatedAt = now;
  activationCode.expiresAt = expiresAt;
  activationCode.lastValidatedAt = now;
  activationCode.status = 'active';
  await activationCode.save();

  // Create device binding
  const binding = await DeviceBinding.create({
    licenseId: license._id,
    deviceId,
    fingerprintHash: require('../services/auditLogService').hashValue(deviceId),
    firstSeenIpHash: require('../services/auditLogService').hashValue(
      require('../services/auditLogService').getRequestIp(req)
    ),
    lastSeenIpHash: require('../services/auditLogService').hashValue(
      require('../services/auditLogService').getRequestIp(req)
    ),
    lastIpPrefix: require('../services/auditLogService').getIpPrefix(
      require('../services/auditLogService').getRequestIp(req)
    ),
    status: 'active'
  });

  // Issue license token
  const { signLicenseToken } = require('../utils/licenseToken');
  const tokenData = {
    licenseId: license._id.toString(),
    code: license.code,
    type: license.type,
    status: license.status,
    expiresAt: license.expiresAt,
    revalidationIntervalSeconds: license.revalidationIntervalSeconds,
    offlineGraceSeconds: license.offlineGraceSeconds,
    clockSkewToleranceSeconds: license.clockSkewToleranceSeconds,
    deviceId,
    features: license.features || []
  };

  const token = signLicenseToken(tokenData);

  // Create audit log
  await createAuditLog({
    req,
    action: 'activate',
    outcome: 'success',
    code: license.code,
    deviceId,
    requestId: null,
    metadata: { adminActivated: true, directActivation: true, licenseType }
  });

  res.status(201).json({
    success: true,
    activated: true,
    data: {
      status: 'active',
      token: token.token,
      license: {
        id: license._id,
        code: license.code,
        type: license.type,
        status: license.status,
        expiresAt: license.expiresAt,
        revalidationIntervalSeconds: license.revalidationIntervalSeconds,
        offlineGraceSeconds: license.offlineGraceSeconds,
        features: license.features
      },
      claims: tokenData,
      tokenHeader: token.tokenHeader
    }
  });
});
