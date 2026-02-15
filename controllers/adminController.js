const Admin = require('../models/Admin');
const ActivationCode = require('../models/ActivationCode');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

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
    recentActivations,
    adminInfo
  ] = await Promise.all([
    ActivationCode.countDocuments(),
    ActivationCode.countDocuments({ used: true }),
    ActivationCode.countDocuments({ used: false }),
    ActivationCode.distinct('deviceId', { used: true, deviceId: { $ne: null } }),
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
      lastPasswordChange: adminInfo?.lastChanged
    },
    recentActivations
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