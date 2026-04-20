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
        used: false
      }
    }
  );

  request.status = 'pending';
  request.completedAt = null;
  request.approvedAt = null;
  await request.save();

  return request;
};

exports.createRequest = asyncHandler(async (req, res) => {
  const normalizedDeviceId = req.body.deviceId.trim();

  const previousRequests = await ActivationRequest.find({
    deviceId: normalizedDeviceId
  }).select('_id');

  const previousRequestIds = previousRequests.map((request) => request._id);

  if (previousRequestIds.length) {
    await ActivationCode.deleteMany({
      requestId: { $in: previousRequestIds }
    });

    await ActivationRequest.deleteMany({
      _id: { $in: previousRequestIds }
    });
  }

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

  await refreshExpiredRequestState(request);

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
  const normalizedCode = normalizeCode(code);
  const normalizedDeviceId = deviceId.trim();

  const activationRequest = await ActivationRequest.findById(requestId);

  if (!activationRequest) {
    throw new AppError('Activation request not found', 404);
  }

  await refreshExpiredRequestState(activationRequest);

  if (activationRequest.deviceId !== normalizedDeviceId) {
    throw new AppError('This activation request belongs to another device', 403);
  }

  if (!['approved', 'completed'].includes(activationRequest.status)) {
    throw new AppError('This activation request is not approved yet', 403);
  }

  const matchingCodeEntry = await ActivationCode.findOne({
    code: normalizedCode
  }).sort({ createdAt: -1 });

  const codeBelongsToThisRequest = activationRequest.assignedCode === normalizedCode;
  const codeCanBeReusedByThisDevice = matchingCodeEntry && (
    !matchingCodeEntry.used ||
    (
      matchingCodeEntry.deviceId === normalizedDeviceId &&
      String(matchingCodeEntry.requestId || '') === String(activationRequest._id)
    )
  );

  if (!codeBelongsToThisRequest && !codeCanBeReusedByThisDevice) {
    throw new AppError('This code is not available for the provided activation request', 403);
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
  activationRequest.assignedCode = normalizedCode;
  activationRequest.completedAt = entry.activatedAt;
  await activationRequest.save();

  console.log(`Activated: ${normalizedCode} for device: ${normalizedDeviceId}`);

  res.json({
    success: true,
    message: 'Activation successful',
    activatedAt: entry.activatedAt
  });
});
