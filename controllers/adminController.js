const Admin = require('../models/Admin');
const ActivationCode = require('../models/ActivationCode');
const ActivationRequest = require('../models/ActivationRequest');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

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

  const requestsWithDeviceUsage = await attachDeviceUsageToRequests(requests);

  res.json({
    success: true,
    requests: requestsWithDeviceUsage
  });
});

exports.approveActivationRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const normalizedCode = normalizeCode(req.body.code);
  const request = await ActivationRequest.findById(requestId);

  if (!request) {
    throw new AppError('Activation request not found', 404);
  }

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

  res.json({
    success: true,
    message: 'Activation request activated successfully',
    request
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
