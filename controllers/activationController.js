const ActivationCode = require('../models/ActivationCode');
const ActivationRequest = require('../models/ActivationRequest');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

exports.createRequest = asyncHandler(async (req, res) => {
  const normalizedDeviceId = req.body.deviceId.trim();

  const existingActivation = await ActivationCode.findOne({
    used: true,
    deviceId: normalizedDeviceId
  }).select('code activatedAt');

  if (existingActivation) {
    return res.json({
      success: true,
      status: 'already_activated',
      message: 'Device already activated',
      activation: {
        code: existingActivation.code,
        activatedAt: existingActivation.activatedAt
      }
    });
  }

  let request = await ActivationRequest.findActiveForDevice(normalizedDeviceId);

  if (!request) {
    request = await ActivationRequest.create({
      deviceId: normalizedDeviceId
    });
  }

  res.status(201).json({
    success: true,
    message: request.status === 'approved'
      ? 'Activation request already approved'
      : 'Activation request created successfully',
    request: {
      id: request._id,
      deviceId: request.deviceId,
      status: request.status,
      assignedCode: request.status === 'approved' ? request.assignedCode : null,
      createdAt: request.createdAt,
      approvedAt: request.approvedAt
    }
  });
});

exports.getRequestStatus = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const deviceId = req.query.deviceId?.trim();

  const request = await ActivationRequest.findById(requestId);

  if (!request) {
    throw new AppError('Activation request not found', 404);
  }

  if (deviceId && request.deviceId !== deviceId) {
    throw new AppError('This request does not belong to this device', 403);
  }

  res.json({
    success: true,
    request: {
      id: request._id,
      deviceId: request.deviceId,
      status: request.status,
      assignedCode: request.status === 'approved' ? request.assignedCode : null,
      approvedAt: request.approvedAt,
      completedAt: request.completedAt,
      rejectionReason: request.rejectionReason,
      createdAt: request.createdAt
    }
  });
});

exports.activate = asyncHandler(async (req, res) => {
  const { requestId, code, deviceId } = req.body;
  const normalizedCode = code.toUpperCase().trim();
  const normalizedDeviceId = deviceId.trim();

  const activationRequest = await ActivationRequest.findById(requestId);

  if (!activationRequest) {
    throw new AppError('Activation request not found', 404);
  }

  if (activationRequest.deviceId !== normalizedDeviceId) {
    throw new AppError('This activation request belongs to another device', 403);
  }

  if (activationRequest.status !== 'approved') {
    throw new AppError('This activation request is not approved yet', 403);
  }

  if (activationRequest.assignedCode !== normalizedCode) {
    throw new AppError('This code is not assigned to the provided activation request', 403);
  }

  const entry = await ActivationCode.findByCode(normalizedCode);

  if (!entry) {
    throw new AppError('Activation code is invalid', 400);
  }

  if (entry.used && entry.deviceId !== normalizedDeviceId) {
    throw new AppError('This code is already activated on another device', 403);
  }

  if (entry.used && entry.deviceId === normalizedDeviceId) {
    if (activationRequest.status !== 'completed') {
      activationRequest.status = 'completed';
      activationRequest.completedAt = entry.activatedAt || new Date();
      await activationRequest.save();
    }

    return res.json({
      success: true,
      message: 'Already activated on this device',
      activatedAt: entry.activatedAt
    });
  }

  entry.used = true;
  entry.deviceId = normalizedDeviceId;
  entry.activatedAt = new Date();
  await entry.save();

  activationRequest.status = 'completed';
  activationRequest.completedAt = entry.activatedAt;
  await activationRequest.save();

  console.log(`Activated: ${normalizedCode} for device: ${normalizedDeviceId}`);

  res.json({
    success: true,
    message: 'Activation successful',
    activatedAt: entry.activatedAt
  });
});
