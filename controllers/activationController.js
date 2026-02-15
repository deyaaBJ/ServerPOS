const ActivationCode = require('../models/ActivationCode');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

exports.activate = asyncHandler(async (req, res) => {
  const { code, deviceId } = req.body;
  const normalizedCode = code.toUpperCase().trim();
  const normalizedDeviceId = deviceId.trim();

  const entry = await ActivationCode.findByCode(normalizedCode);

  if (!entry) {
    throw new AppError('كود التفعيل غير صحيح', 400);
  }

  // Code already used on different device
  if (entry.used && entry.deviceId !== normalizedDeviceId) {
    throw new AppError(
      'هذا الكود مستخدم على جهاز آخر. يرجى مراجعة الأدمن.',
      403
    );
  }

  // Code already used on same device
  if (entry.used && entry.deviceId === normalizedDeviceId) {
    return res.json({
      success: true,
      message: 'Already activated on this device',
      activatedAt: entry.activatedAt
    });
  }

  // Activate code
  entry.used = true;
  entry.deviceId = normalizedDeviceId;
  entry.activatedAt = new Date();
  await entry.save();

  console.log(`✅ Activated: ${normalizedCode} for device: ${normalizedDeviceId}`);

  res.json({
    success: true,
    message: 'Activation successful',
    activatedAt: entry.activatedAt
  });
});