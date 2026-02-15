const ActivationCode = require('../models/ActivationCode');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

// Get all codes
exports.getAllCodes = asyncHandler(async (req, res) => {
  const codes = await ActivationCode.find()
    .sort({ createdAt: -1 })
    .select('-__v');

  res.json({
    success: true,
    count: codes.length,
    codes
  });
});

// Add new code
exports.addCode = asyncHandler(async (req, res) => {
  const { code } = req.body;
  const normalizedCode = code.toUpperCase().trim();

  // Check if code exists (case insensitive)
  const existingCode = await ActivationCode.findByCode(normalizedCode);
  
  if (existingCode) {
    throw new AppError('هذا الكود موجود مسبقاً في النظام', 409);
  }

  const newCode = await ActivationCode.create({
    code: normalizedCode
  });

  res.status(201).json({
    success: true,
    message: 'Code added successfully',
    code: newCode
  });
});

// Delete code (even if used)
exports.deleteCode = asyncHandler(async (req, res) => {
  const { code } = req.params;
  const normalizedCode = code.toUpperCase().trim();

  const codeEntry = await ActivationCode.findByCode(normalizedCode);
  
  if (!codeEntry) {
    throw new AppError('الكود غير موجود', 404);
  }

  const wasUsed = codeEntry.used;
  const deviceId = codeEntry.deviceId;

  await ActivationCode.deleteOne({ code: normalizedCode });

  res.json({
    success: true,
    message: wasUsed 
      ? `تم حذف الكود المفعل بنجاح (كان مربوط بالجهاز: ${deviceId || 'غير معروف'})`
      : 'تم حذف الكود بنجاح',
    deletedCode: {
      code: normalizedCode,
      wasUsed,
      deviceId
    }
  });
});

// Get single code details
exports.getCodeDetails = asyncHandler(async (req, res) => {
  const { code } = req.params;
  const normalizedCode = code.toUpperCase().trim();

  const codeEntry = await ActivationCode.findByCode(normalizedCode);
  
  if (!codeEntry) {
    throw new AppError('الكود غير موجود', 404);
  }

  res.json({
    success: true,
    code: codeEntry
  });
});