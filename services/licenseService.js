const crypto = require('crypto');
const ActivationCode = require('../models/ActivationCode');
const ActivationRequest = require('../models/ActivationRequest');
const License = require('../models/License');
const DeviceBinding = require('../models/DeviceBinding');
const LicenseValidation = require('../models/LicenseValidation');
const Revocation = require('../models/Revocation');
const { AppError } = require('../middleware/errorHandler');
const { normalizeCode } = require('../utils/code');
const { signLicenseToken, verifyLicenseToken } = require('../utils/licenseToken');
const { buildPolicyFromCode } = require('./licensePolicyService');
const { createAuditLog, getRequestIp, getIpPrefix, hashValue } = require('./auditLogService');

const randomId = () => crypto.randomBytes(12).toString('hex');

const buildError = (statusCode, code, message, details = null) => {
  const error = new AppError(message, statusCode);
  error.errorCode = code;
  error.details = details;
  return error;
};

const nowDate = () => new Date();

const deriveLicenseStatus = (license, now = nowDate()) => {
  if (license.status === 'revoked' || license.revokedAt) {
    return 'revoked';
  }

  if (license.expiresAt && now >= license.expiresAt) {
    return 'expired';
  }

  return license.status || 'active';
};

const ensureRequestApproved = async (requestId, deviceId) => {
  const request = await ActivationRequest.findById(requestId);
  if (!request) {
    throw buildError(404, 'REQUEST_NOT_FOUND', 'Activation request not found');
  }

  if (request.deviceId !== deviceId) {
    throw buildError(403, 'REQUEST_DEVICE_MISMATCH', 'This activation request belongs to another device');
  }

  if (!['approved', 'completed'].includes(request.status)) {
    throw buildError(403, 'REQUEST_NOT_APPROVED', 'This activation request is not approved');
  }

  return request;
};

const ensureActivationCodeUsable = async (request, code) => {
  const activationCode = await ActivationCode.findOne({
    code,
    $or: [
      { requestId: request._id },
      { requestId: null }
    ]
  }).sort({ createdAt: -1 });

  if (!activationCode) {
    throw buildError(404, 'LICENSE_NOT_FOUND', 'Activation code not found');
  }

  if (activationCode.status === 'revoked' || activationCode.revokedAt) {
    throw buildError(403, 'LICENSE_REVOKED', 'License has been revoked');
  }

  return activationCode;
};

const upsertLicenseFromActivationCode = async ({ activationCode, request, deviceId, now }) => {
  const policy = buildPolicyFromCode(activationCode.code, now);
  const update = {
    code: activationCode.code,
    requestId: request?._id || activationCode.requestId || null,
    type: policy.type,
    expiresAt: policy.expiresAt,
    revalidationIntervalSeconds: policy.revalidationIntervalSeconds,
    offlineGraceSeconds: policy.offlineGraceSeconds,
    clockSkewToleranceSeconds: policy.clockSkewToleranceSeconds,
    maxDevices: 1,
    status: 'active',
    firstActivatedAt: now,
    lastValidatedAt: now
  };

  const license = await License.findOneAndUpdate(
    { code: activationCode.code },
    {
      $set: update,
      $setOnInsert: {
        validationCount: 0,
        tokenVersion: 1,
        features: []
      }
    },
    {
      new: true,
      upsert: true
    }
  );

  activationCode.used = true;
  activationCode.deviceId = deviceId;
  activationCode.activatedAt = now;
  activationCode.expiresAt = policy.expiresAt;
  activationCode.lastValidatedAt = now;
  activationCode.status = 'active';
  activationCode.revokedAt = null;
  await activationCode.save();

  return license;
};

const getLicenseByCode = async (code) => License.findOne({ code: normalizeCode(code) });

const isActivationCodeInactive = (activationCode, now = nowDate()) => (
  !activationCode ||
  !activationCode.used ||
  activationCode.status !== 'active' ||
  activationCode.revokedAt ||
  (activationCode.expiresAt && now >= activationCode.expiresAt)
);

const syncLicenseState = async (license, now = nowDate()) => {
  const derived = deriveLicenseStatus(license, now);
  if (license.status !== derived) {
    license.status = derived;
    await license.save();
  }
  return derived;
};

const assertDeviceBinding = async ({ license, deviceId, fingerprintHash, req, metadata = {} }) => {
  const activeBindings = await DeviceBinding.find({ licenseId: license._id }).sort({ createdAt: 1 });
  const existingByDevice = activeBindings.find((row) => row.deviceId === deviceId);

  if (existingByDevice) {
    if (existingByDevice.fingerprintHash !== fingerprintHash) {
      existingByDevice.status = 'device_changed';
      existingByDevice.notes = 'Fingerprint changed';
      await existingByDevice.save();

      license.status = 'device_changed';
      await license.save();

      await createAuditLog({
        req,
        action: 'check-device',
        outcome: 'rejected',
        code: license.code,
        deviceId,
        requestId: license.requestId,
        reason: 'device_fingerprint_changed',
        metadata
      });

      throw buildError(403, 'DEVICE_CHANGED', 'Device fingerprint changed. Manual review required');
    }

    return existingByDevice;
  }

  if (activeBindings.length >= license.maxDevices) {
    license.status = 'requires_manual_review';
    await license.save();

    await createAuditLog({
      req,
      action: 'check-device',
      outcome: 'rejected',
      code: license.code,
      deviceId,
      requestId: license.requestId,
      reason: 'device_limit_exceeded',
      metadata: {
        ...metadata,
        knownDevices: activeBindings.map((row) => row.deviceId)
      }
    });

    throw buildError(403, 'MULTIPLE_DEVICES_DETECTED', 'License is already bound to another device');
  }

  return DeviceBinding.create({
    licenseId: license._id,
    deviceId,
    fingerprintHash,
    firstSeenIpHash: hashValue(getRequestIp(req)),
    lastSeenIpHash: hashValue(getRequestIp(req)),
    lastIpPrefix: getIpPrefix(getRequestIp(req)),
    status: 'active'
  });
};

const issueLicenseToken = async ({ license, binding, now = nowDate() }) => {
  // Keep claims intentionally minimal so the app can verify locally without becoming the source of truth.
  const issuedAt = now;
  const expiresAt = license.expiresAt || null;
  const revalidateAfter = new Date(issuedAt.getTime() + (license.revalidationIntervalSeconds * 1000));
  const offlineGraceUntil = new Date(revalidateAfter.getTime() + (license.offlineGraceSeconds * 1000));
  const nonce = randomId();
  const rollingValidationId = randomId();

  const payload = {
    licenseId: String(license._id),
    deviceId: binding.deviceId,
    deviceFingerprintHash: binding.fingerprintHash,
    licenseType: license.type,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    revalidateAfter: revalidateAfter.toISOString(),
    offlineGraceUntil: offlineGraceUntil.toISOString(),
    features: license.features || [],
    version: license.tokenVersion,
    nonce,
    rollingValidationId
  };

  const signed = signLicenseToken(payload);
  license.lastIssuedAt = issuedAt;
  license.lastTokenNonce = nonce;
  await license.save();

  return {
    token: signed.token,
    tokenHeader: signed.header,
    license: payload
  };
};

const recordValidation = async ({ license, binding, outcome, reasonCode, tokenPayload = null, req, metadata = null }) => {
  await LicenseValidation.create({
    licenseId: license._id,
    deviceBindingId: binding?._id || null,
    deviceId: binding?.deviceId || metadata?.deviceId || 'unknown',
    outcome,
    reasonCode,
    tokenKid: tokenPayload?.header?.kid || null,
    tokenVersion: tokenPayload?.payload?.version || null,
    nonce: tokenPayload?.payload?.nonce || null,
    rollingValidationId: tokenPayload?.payload?.rollingValidationId || null,
    ipHash: hashValue(getRequestIp(req)),
    metadata
  });
};

const detectAbuseSignals = async ({ license, binding, now, tokenPayload }) => {
  const warnings = [];

  if (license.lastValidatedAt && (now - license.lastValidatedAt) < 30 * 1000) {
    warnings.push('rapid_revalidation');
  }

  if (binding.validationCount > 0 && tokenPayload?.payload?.nonce && tokenPayload.payload.nonce === license.lastTokenNonce) {
    warnings.push('nonce_reuse_detected');
  }

  // TODO: enrich this with geo velocity and device attestation signals when the client can provide them safely.
  return warnings;
};

const activateLicense = async ({ requestId, code, deviceId, fingerprint, req }) => {
  const now = nowDate();
  const normalizedCode = normalizeCode(code);
  const normalizedDeviceId = String(deviceId).trim();
  const fingerprintHash = hashValue(fingerprint || normalizedDeviceId);

  const request = await ensureRequestApproved(requestId, normalizedDeviceId);
  const activationCode = await ensureActivationCodeUsable(request, normalizedCode);
  const license = await upsertLicenseFromActivationCode({ activationCode, request, deviceId: normalizedDeviceId, now });
  const binding = await assertDeviceBinding({ license, deviceId: normalizedDeviceId, fingerprintHash, req });
  const token = await issueLicenseToken({ license, binding, now });

  binding.lastValidationAt = now;
  binding.validationCount += 1;
  binding.lastSeenIpHash = hashValue(getRequestIp(req));
  binding.lastIpPrefix = getIpPrefix(getRequestIp(req));
  await binding.save();

  license.validationCount += 1;
  license.lastValidatedAt = now;
  await license.save();

  request.status = 'completed';
  request.assignedCode = normalizedCode;
  request.completedAt = now;
  await request.save();

  await createAuditLog({
    req,
    action: 'activate',
    outcome: 'success',
    code: license.code,
    deviceId: normalizedDeviceId,
    requestId: request._id,
    metadata: {
      licenseId: String(license._id),
      type: license.type
    }
  });

  await recordValidation({
    license,
    binding,
    outcome: 'success',
    reasonCode: 'activation',
    req,
    metadata: { phase: 'activation' }
  });

  return { license, binding, token };
};

const revalidateLicense = async ({ currentToken, deviceId, fingerprint, clientTime, req }) => {
  const now = nowDate();
  const normalizedDeviceId = String(deviceId).trim();
  const fingerprintHash = hashValue(fingerprint || normalizedDeviceId);
  const verifiedToken = verifyLicenseToken(currentToken);

  if (!verifiedToken) {
    throw buildError(401, 'TOKEN_INVALID', 'License token is invalid or tampered');
  }

  const { payload } = verifiedToken;
  if (payload.deviceId !== normalizedDeviceId) {
    throw buildError(403, 'TOKEN_DEVICE_MISMATCH', 'Token does not belong to this device');
  }

  const license = await License.findById(payload.licenseId);
  if (!license) {
    throw buildError(404, 'LICENSE_NOT_FOUND', 'License not found');
  }

  const status = await syncLicenseState(license, now);
  const binding = await assertDeviceBinding({
    license,
    deviceId: normalizedDeviceId,
    fingerprintHash,
    req,
    metadata: { licenseId: payload.licenseId }
  });

  if (status === 'revoked') {
    await recordValidation({ license, binding, outcome: 'revoked', reasonCode: 'license_revoked', tokenPayload: verifiedToken, req });
    throw buildError(403, 'LICENSE_REVOKED', 'License has been revoked');
  }

  if (status === 'expired') {
    await recordValidation({ license, binding, outcome: 'expired', reasonCode: 'license_expired', tokenPayload: verifiedToken, req });
    throw buildError(403, 'LICENSE_EXPIRED', 'License has expired');
  }

  const tokenIssuedAt = new Date(payload.issuedAt);
  const tokenRevalidateAfter = new Date(payload.revalidateAfter);
  const tokenOfflineGraceUntil = new Date(payload.offlineGraceUntil);
  const tokenExpiresAt = payload.expiresAt ? new Date(payload.expiresAt) : null;
  const clientTimeDate = clientTime ? new Date(clientTime) : null;

  if (Number.isNaN(tokenIssuedAt.getTime()) || Number.isNaN(tokenRevalidateAfter.getTime()) || Number.isNaN(tokenOfflineGraceUntil.getTime())) {
    throw buildError(400, 'TOKEN_MALFORMED', 'Token contains invalid date fields');
  }

  if (clientTimeDate && !Number.isNaN(clientTimeDate.getTime())) {
    const clockDiffSeconds = Math.abs(Math.floor((now - clientTimeDate) / 1000));
    if (clockDiffSeconds > license.clockSkewToleranceSeconds + 60) {
      throw buildError(400, 'CLIENT_CLOCK_INVALID', 'Client clock is outside the allowed tolerance');
    }
  }

  if (tokenExpiresAt && now >= tokenExpiresAt) {
    throw buildError(403, 'TOKEN_LICENSE_EXPIRED', 'License token is past license expiry');
  }

  if (payload.version !== license.tokenVersion) {
    throw buildError(409, 'TOKEN_VERSION_MISMATCH', 'A newer license token version is required');
  }

  if (license.lastIssuedAt && tokenIssuedAt < license.lastIssuedAt && payload.nonce !== license.lastTokenNonce) {
    throw buildError(409, 'STALE_TOKEN', 'A stale token was presented');
  }

  const warnings = await detectAbuseSignals({ license, binding, now, tokenPayload: verifiedToken });
  const refreshedToken = await issueLicenseToken({ license, binding, now });

  binding.lastValidationAt = now;
  binding.validationCount += 1;
  binding.lastSeenIpHash = hashValue(getRequestIp(req));
  binding.lastIpPrefix = getIpPrefix(getRequestIp(req));
  await binding.save();

  license.validationCount += 1;
  license.lastValidatedAt = now;
  await license.save();

  await recordValidation({
    license,
    binding,
    outcome: warnings.length ? 'suspicious' : 'success',
    reasonCode: warnings[0] || 'revalidated',
    tokenPayload: verifiedToken,
    req,
    metadata: {
      warnings,
      revalidateWindowOpened: now >= tokenRevalidateAfter,
      offlineGraceUntil: tokenOfflineGraceUntil.toISOString()
    }
  });

  await createAuditLog({
    req,
    action: 'validate',
    outcome: warnings.length ? 'error' : 'success',
    code: license.code,
    deviceId: normalizedDeviceId,
    requestId: license.requestId,
    reason: warnings[0] || null,
    metadata: {
      licenseId: String(license._id),
      warnings
    }
  });

  return { license, binding, token: refreshedToken, warnings };
};

const getLicenseStatus = async ({ code, token, deviceId, fingerprint, req }) => {
  let license = null;
  let verifiedToken = null;

  if (token) {
    verifiedToken = verifyLicenseToken(token);
    if (!verifiedToken) {
      throw buildError(401, 'TOKEN_INVALID', 'License token is invalid or tampered');
    }
    license = await License.findById(verifiedToken.payload.licenseId);
  } else {
    license = await getLicenseByCode(code);
  }

  if (!license) {
    throw buildError(404, 'LICENSE_NOT_FOUND', 'License not found');
  }

  const status = await syncLicenseState(license);
  let binding = null;
  if (deviceId) {
    binding = await assertDeviceBinding({
      license,
      deviceId: String(deviceId).trim(),
      fingerprintHash: hashValue(fingerprint || deviceId),
      req,
      metadata: { lookup: true }
    });
  }

  return {
    license,
    binding,
    status,
    verifiedToken
  };
};

const getDeviceActivationStatus = async ({ deviceId, req }) => {
  const now = nowDate();
  const normalizedDeviceId = String(deviceId).trim();
  const inactiveResult = (status = 'not_activated') => ({
    activated: false,
    status
  });

  let binding = await DeviceBinding.findOne({ deviceId: normalizedDeviceId })
    .sort({ updatedAt: -1, createdAt: -1 });
  let license = binding ? await License.findById(binding.licenseId) : null;

  if (!license) {
    const activationCode = await ActivationCode.findOne({
      deviceId: normalizedDeviceId,
      used: true
    }).sort({ activatedAt: -1, createdAt: -1 });

    if (isActivationCodeInactive(activationCode, now)) {
      return inactiveResult(activationCode?.status === 'expired' ? 'expired' : 'not_activated');
    }

    const request = activationCode.requestId
      ? await ActivationRequest.findById(activationCode.requestId)
      : null;

    if (request && ['rejected', 'deactivated'].includes(request.status)) {
      return inactiveResult(request.status);
    }

    license = await getLicenseByCode(activationCode.code);
    if (!license) {
      license = await upsertLicenseFromActivationCode({
        activationCode,
        request,
        deviceId: normalizedDeviceId,
        now: activationCode.activatedAt || now
      });
    }

    binding = await DeviceBinding.findOne({
      licenseId: license._id,
      deviceId: normalizedDeviceId
    });

    if (!binding) {
      binding = await assertDeviceBinding({
        license,
        deviceId: normalizedDeviceId,
        fingerprintHash: hashValue(normalizedDeviceId),
        req,
        metadata: { source: 'device-status' }
      });
    }
  }

  const status = await syncLicenseState(license, now);
  if (status !== 'active' || binding.status !== 'active') {
    return inactiveResult(status);
  }

  const token = await issueLicenseToken({ license, binding, now });

  await createAuditLog({
    req,
    action: 'activate',
    outcome: 'success',
    code: license.code,
    deviceId: normalizedDeviceId,
    requestId: request?._id || activationCode.requestId || null,
    metadata: {
      source: 'device-status',
      licenseId: String(license._id),
      viaExistingCode: true
    }
  });

  return {
    activated: true,
    status,
    license,
    binding,
    token
  };
};

const refreshLicenseToken = async ({ token, deviceId, fingerprint, clientTime, req }) => revalidateLicense({
  currentToken: token,
  deviceId,
  fingerprint,
  clientTime,
  req
});

const revokeLicense = async ({ code, reason, revokedBy, req }) => {
  const license = await getLicenseByCode(code);
  if (!license) {
    throw buildError(404, 'LICENSE_NOT_FOUND', 'License not found');
  }

  license.status = 'revoked';
  license.revokedAt = nowDate();
  license.revokedReason = reason;
  license.revokedBy = revokedBy;
  license.tokenVersion += 1;
  await license.save();

  await DeviceBinding.updateMany({ licenseId: license._id }, { $set: { status: 'revoked' } });
  await ActivationCode.updateMany({ code: license.code }, { $set: { status: 'revoked', revokedAt: license.revokedAt } });

  await Revocation.create({
    licenseId: license._id,
    reason,
    revokedAt: license.revokedAt,
    revokedBy
  });

  await createAuditLog({
    req,
    action: 'revoke',
    outcome: 'success',
    code: license.code,
    requestId: license.requestId,
    reason,
    metadata: {
      revokedBy
    }
  });

  return license;
};

module.exports = {
  activateLicense,
  revalidateLicense,
  getLicenseStatus,
  getDeviceActivationStatus,
  refreshLicenseToken,
  revokeLicense,
  buildError
};
