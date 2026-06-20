const Admin = require('../models/Admin');
const ActivationCode = require('../models/ActivationCode');
const ActivationRequest = require('../models/ActivationRequest');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { isCodeExpired, normalizeCode } = require('../utils/code');

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

  request.status = 'pending';
  request.assignedCode = null;
  request.completedAt = null;
  request.approvedAt = null;
  request.rejectedAt = null;
  request.rejectionReason = null;
  await request.save();

  return request;
};

const getPreviousRequestsDetails = async (deviceId, currentRequestId = null) => {
  const filter = {
    deviceId: deviceId.trim()
  };

  if (currentRequestId) {
    filter._id = { $ne: currentRequestId };
  }

  const previousRequests = await ActivationRequest.find(filter)
    .sort({ createdAt: -1 })
    .lean();

  if (!previousRequests.length) {
    return [];
  }

  const requestIds = previousRequests.map((request) => request._id);
  const codes = await ActivationCode.find({
    requestId: { $in: requestIds }
  })
    .sort({ createdAt: -1 })
    .select('requestId code used activatedAt createdAt')
    .lean();

  const codesByRequestId = new Map();
  for (const codeEntry of codes) {
    const key = String(codeEntry.requestId);
    if (!codesByRequestId.has(key)) {
      codesByRequestId.set(key, []);
    }
    codesByRequestId.get(key).push({
      code: codeEntry.code,
      used: codeEntry.used,
      activatedAt: codeEntry.activatedAt,
      createdAt: codeEntry.createdAt
    });
  }

  return previousRequests.map((request) => ({
    id: request._id,
    status: request.status,
    assignedCode: request.assignedCode,
    createdAt: request.createdAt,
    approvedAt: request.approvedAt,
    completedAt: request.completedAt,
    codes: codesByRequestId.get(String(request._id)) || []
  }));
};

const deletePreviousRequestsForDevice = async (deviceId, currentRequestId) => {
  const previousRequests = await ActivationRequest.find({
    deviceId: deviceId.trim(),
    _id: { $ne: currentRequestId }
  }).select('_id');

  const previousRequestIds = previousRequests.map((request) => request._id);

  if (!previousRequestIds.length) {
    return;
  }

  await ActivationCode.deleteMany({
    requestId: { $in: previousRequestIds }
  });

  await ActivationRequest.deleteMany({
    _id: { $in: previousRequestIds }
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

  const deviceUsageRows = await ActivationCode.aggregate([
    {
      $match: {
        used: true,
        deviceId: { $in: deviceIds }
      }
    },
    { $sort: { activatedAt: -1, createdAt: -1 } },
    {
      $group: {
        _id: '$deviceId',
        activationCount: { $sum: 1 },
        codes: { $push: '$code' },
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
        codes: row.codes,
        lastActivatedAt: row.lastActivatedAt || null
      }
    ])
  );

  return requests.map((request) => {
    const usage = usageByDeviceId.get(request.deviceId) || {
      exists: false,
      activationCount: 0,
      codes: [],
      lastActivatedAt: null
    };

    return {
      ...request.toObject(),
      deviceUsage: usage
    };
  });
};

const attachPreviousRequestsToRequests = async (requests) => Promise.all(
  requests.map(async (request) => ({
    ...request,
    previousRequests: await getPreviousRequestsDetails(request.deviceId, request._id)
  }))
);

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
  const [
    totalCodes,
    usedCodes,
    availableCodes,
    uniqueDevices,
    pendingRequests,
    recentActivations,
    adminInfo
  ] = await Promise.all([
    ActivationCode.countDocuments(),
    ActivationCode.countDocuments({ used: true }),
    ActivationCode.countDocuments({ used: false }),
    ActivationCode.distinct('deviceId', { used: true, deviceId: { $ne: null } }),
    ActivationRequest.countDocuments({ status: 'pending' }),
    ActivationCode.find({ used: true })
      .sort({ activatedAt: -1 })
      .limit(10)
      .select('code deviceId activatedAt'),
    Admin.findOne({ username: 'admin' }).select('lastChanged')
  ]);

  res.json({
    success: true,
    stats: {
      totalCodes,
      usedCodes,
      availableCodes,
      uniqueDevices: uniqueDevices.length,
      pendingRequests,
      lastPasswordChange: adminInfo?.lastChanged
    },
    recentActivations
  });
});

exports.getActivationRequests = asyncHandler(async (req, res) => {
  const requests = await ActivationRequest.find({ isArchived: { $ne: true } })
    .sort({ createdAt: -1 })
    .limit(100);

  const refreshedRequests = await Promise.all(
    requests.map((request) => refreshExpiredRequestState(request))
  );

  const requestsWithDeviceUsage = await attachDeviceUsageToRequests(refreshedRequests);
  const requestsWithPreviousRequests = await attachPreviousRequestsToRequests(requestsWithDeviceUsage);

  res.json({
    success: true,
    requests: requestsWithPreviousRequests
  });
});

exports.approveActivationRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const normalizedCode = normalizeCode(req.body.code);
  const request = await ActivationRequest.findById(requestId);

  if (!request) {
    throw new AppError('Activation request not found', 404);
  }

  await refreshExpiredRequestState(request);

  if (request.status === 'completed') {
    throw new AppError('Activation request is already completed', 400);
  }

  await ActivationCode.updateMany(
    {
      used: true,
      deviceId: request.deviceId,
      requestId: { $ne: request._id }
    },
    {
      $set: {
        used: false,
        deviceId: null,
        activatedAt: null
      }
    }
  );

  const activatedAt = new Date();
  await ActivationCode.create({
    code: normalizedCode,
    requestId: request._id,
    used: true,
    deviceId: request.deviceId,
    activatedAt,
    createdAt: activatedAt
  });

  request.status = 'completed';
  request.assignedCode = normalizedCode;
  request.approvedAt = activatedAt;
  request.completedAt = activatedAt;
  request.rejectedAt = null;
  request.rejectionReason = null;
  await request.save();

  await deletePreviousRequestsForDevice(request.deviceId, request._id);

  const previousRequests = await getPreviousRequestsDetails(request.deviceId, request._id);

  res.json({
    success: true,
    message: 'Activation request activated successfully',
    request: {
      ...request.toObject(),
      previousRequests
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
        activatedAt: null
      }
    }
  );

  request.status = 'deactivated';
  request.assignedCode = null;
  request.approvedAt = null;
  request.completedAt = null;
  request.rejectedAt = new Date();
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
    action: 'activate-device',
    outcome: 'success',
    code: license.code,
    deviceId,
    requestId: null,
    metadata: { adminActivated: true }
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
