const ActivationRequest = require('../models/ActivationRequest');
const { asyncHandler } = require('../middleware/errorHandler');
const { normalizeCode } = require('../utils/code');
const {
  activateLicense,
  revalidateLicense,
  getLicenseStatus,
  getDeviceActivationStatus,
  refreshLicenseToken,
  revokeLicense
} = require('../services/licenseService');
const { createAuditLog } = require('../services/auditLogService');

const buildSuccessResponse = (data, meta = {}) => ({
  success: true,
  ...meta,
  data
});

const getErrorPayload = (error) => ({
  success: false,
  error: {
    code: error.errorCode || 'INTERNAL_ERROR',
    message: error.message,
    details: error.details || null
  }
});

const sendServiceError = (res, error) => {
  const statusCode = error.statusCode || 500;
  return res.status(statusCode).json(getErrorPayload(error));
};

const buildLicensePayload = (license) => ({
  id: license._id,
  code: license.code,
  type: license.type,
  status: license.status,
  expiresAt: license.expiresAt,
  revalidationIntervalSeconds: license.revalidationIntervalSeconds,
  offlineGraceSeconds: license.offlineGraceSeconds,
  features: license.features
});

exports.createRequest = asyncHandler(async (req, res) => {
  const normalizedDeviceId = req.body.deviceId.trim();
  const request = await ActivationRequest.create({
    deviceId: normalizedDeviceId,
    status: 'pending'
  });

  res.status(201).json(buildSuccessResponse({
    requestId: request._id,
    status: request.status,
    deviceId: request.deviceId,
    createdAt: request.createdAt
  }));
});

exports.getRequestStatus = asyncHandler(async (req, res) => {
  const request = await ActivationRequest.findById(req.params.requestId).lean();

  if (!request) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'REQUEST_NOT_FOUND',
        message: 'Activation request not found'
      }
    });
  }

  res.json(buildSuccessResponse({
    requestId: request._id,
    status: request.status,
    assignedCode: request.assignedCode,
    approvedAt: request.approvedAt,
    completedAt: request.completedAt,
    rejectedAt: request.rejectedAt,
    rejectionReason: request.rejectionReason
  }));
});

exports.activate = asyncHandler(async (req, res) => {
  try {
    const result = await activateLicense({
      requestId: req.body.requestId,
      code: normalizeCode(req.body.code),
      deviceId: req.body.deviceId,
      fingerprint: req.body.deviceFingerprint,
      req
    });

    res.status(201).json(buildSuccessResponse({
      license: buildLicensePayload(result.license),
      token: result.token.token,
      tokenHeader: result.token.tokenHeader,
      claims: result.token.license
    }, {
      message: 'License activated successfully'
    }));
  } catch (error) {
    return sendServiceError(res, error);
  }
});

exports.getDeviceActivationStatus = asyncHandler(async (req, res) => {
  try {
    const result = await getDeviceActivationStatus({
      deviceId: req.query.deviceId || req.body.deviceId,
      req
    });

    if (!result.activated) {
      return res.json(buildSuccessResponse({
        status: result.status || 'not_activated'
      }, {
        activated: false
      }));
    }

    res.json(buildSuccessResponse({
      status: result.status,
      token: result.token.token,
      license: buildLicensePayload(result.license),
      claims: result.token.license,
      tokenHeader: result.token.tokenHeader
    }, {
      activated: true
    }));
  } catch (error) {
    return sendServiceError(res, error);
  }
});

exports.validateLicense = asyncHandler(async (req, res) => {
  try {
    const result = await revalidateLicense({
      currentToken: req.body.licenseToken,
      deviceId: req.body.deviceId,
      fingerprint: req.body.deviceFingerprint,
      clientTime: req.body.clientTime,
      req
    });

    res.json(buildSuccessResponse({
      valid: true,
      status: result.license.status,
      warnings: result.warnings,
      token: result.token.token,
      tokenHeader: result.token.tokenHeader,
      claims: result.token.license
    }, {
      message: 'License revalidated successfully'
    }));
  } catch (error) {
    return sendServiceError(res, error);
  }
});

exports.revalidateLicense = exports.validateLicense;

exports.checkDeviceLicense = asyncHandler(async (req, res) => {
  try {
    const result = await getLicenseStatus({
      code: req.body.code,
      deviceId: req.body.deviceId,
      fingerprint: req.body.deviceFingerprint,
      req
    });

    res.json(buildSuccessResponse({
      valid: result.status === 'active',
      status: result.status,
      license: {
        id: result.license._id,
        code: result.license.code,
        type: result.license.type,
        expiresAt: result.license.expiresAt
      },
      deviceBinding: result.binding ? {
        status: result.binding.status,
        lastValidationAt: result.binding.lastValidationAt,
        validationCount: result.binding.validationCount
      } : null
    }));
  } catch (error) {
    return sendServiceError(res, error);
  }
});

exports.getLicenseStatus = asyncHandler(async (req, res) => {
  try {
    const result = await getLicenseStatus({
      code: req.body.code,
      token: req.body.licenseToken,
      deviceId: req.body.deviceId,
      fingerprint: req.body.deviceFingerprint,
      req
    });

    await createAuditLog({
      req,
      action: 'status',
      outcome: 'success',
      code: result.license.code,
      deviceId: req.body.deviceId || null,
      requestId: result.license.requestId,
      metadata: {
        status: result.status
      }
    });

    res.json(buildSuccessResponse({
      status: result.status,
      license: {
        id: result.license._id,
        code: result.license.code,
        type: result.license.type,
        expiresAt: result.license.expiresAt,
        revokedAt: result.license.revokedAt,
        revokedReason: result.license.revokedReason,
        lastValidatedAt: result.license.lastValidatedAt,
        validationCount: result.license.validationCount
      }
    }));
  } catch (error) {
    return sendServiceError(res, error);
  }
});

exports.refreshToken = asyncHandler(async (req, res) => {
  try {
    const result = await refreshLicenseToken({
      token: req.body.licenseToken,
      deviceId: req.body.deviceId,
      fingerprint: req.body.deviceFingerprint,
      clientTime: req.body.clientTime,
      req
    });

    await createAuditLog({
      req,
      action: 'refresh-token',
      outcome: 'success',
      code: result.license.code,
      deviceId: req.body.deviceId,
      requestId: result.license.requestId
    });

    res.json(buildSuccessResponse({
      token: result.token.token,
      tokenHeader: result.token.tokenHeader,
      claims: result.token.license,
      warnings: result.warnings
    }));
  } catch (error) {
    return sendServiceError(res, error);
  }
});

exports.revokeLicense = asyncHandler(async (req, res) => {
  try {
    const license = await revokeLicense({
      code: req.body.code,
      reason: req.body.reason,
      revokedBy: req.session?.admin?.username || 'admin',
      req
    });

    res.json(buildSuccessResponse({
      licenseId: license._id,
      code: license.code,
      status: license.status,
      revokedAt: license.revokedAt,
      revokedReason: license.revokedReason,
      revokedBy: license.revokedBy
    }, {
      message: 'License revoked successfully'
    }));
  } catch (error) {
    return sendServiceError(res, error);
  }
});
