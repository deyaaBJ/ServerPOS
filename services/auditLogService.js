const crypto = require('crypto');
const LicenseAuditLog = require('../models/LicenseAuditLog');

const hashValue = (value) => {
  if (!value) {
    return null;
  }

  return crypto.createHash('sha256').update(String(value)).digest('hex');
};

const getRequestIp = (req) => req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;

const getIpPrefix = (ipAddress) => {
  if (!ipAddress) {
    return null;
  }

  const trimmed = String(ipAddress).split(',')[0].trim();
  if (trimmed.includes(':')) {
    return trimmed.split(':').slice(0, 4).join(':');
  }

  return trimmed.split('.').slice(0, 3).join('.');
};

const sanitizeMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object') {
    return metadata || null;
  }

  const clone = { ...metadata };
  delete clone.token;
  delete clone.signature;
  delete clone.currentToken;
  delete clone.publicKey;
  delete clone.privateKey;
  return clone;
};

const createAuditLog = async ({
  req,
  action,
  outcome,
  reason = null,
  code = null,
  deviceId = null,
  requestId = null,
  metadata = null
}) => LicenseAuditLog.create({
  action,
  outcome,
  reason,
  code,
  deviceId,
  requestId,
  metadata: sanitizeMetadata(metadata),
  ipAddress: hashValue(getRequestIp(req)),
  userAgent: req.get('user-agent') || null,
  ipPrefix: getIpPrefix(getRequestIp(req))
});

module.exports = {
  createAuditLog,
  getRequestIp,
  getIpPrefix,
  hashValue
};
