const ActivationCode = require('../models/ActivationCode');
const ActivationRequest = require('../models/ActivationRequest');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

exports.createRequest = asyncHandler(async (req, res) => {
  const normalizedDeviceId = req.body.deviceId.trim();
  const request = await ActivationRequest.create({
    deviceId: normalizedDeviceId
  });

  res.status(201).json({
    success: true,
    message: 'Activation request created successfully',
    request: {
      id: request._id,
      deviceId: request.deviceId,
      status: request.status,
      assignedCode: request.assignedCode,
      createdAt: request.createdAt,
      approvedAt: request.approvedAt,
      completedAt: request.completedAt
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
      assignedCode: request.assignedCode,
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

  if (!['approved', 'completed'].includes(activationRequest.status)) {
    throw new AppError('This activation request is not approved yet', 403);
  }

  if (activationRequest.assignedCode !== normalizedCode) {
    throw new AppError('This code is not assigned to the provided activation request', 403);
  }

  await ActivationCode.updateMany(
    {
      used: true,
      deviceId: normalizedDeviceId,
      requestId: { $ne: activationRequest._id }
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
  let entry = await ActivationCode.findOne({
    requestId: activationRequest._id,
    deviceId: normalizedDeviceId,
    code: normalizedCode
  }).sort({ createdAt: -1 });

  if (entry) {
    entry.used = true;
    entry.activatedAt = activatedAt;
    await entry.save();
  } else {
    entry = await ActivationCode.create({
      code: normalizedCode,
      requestId: activationRequest._id,
      used: true,
      deviceId: normalizedDeviceId,
      activatedAt,
      createdAt: activatedAt
    });
  }

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
