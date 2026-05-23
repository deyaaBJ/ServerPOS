const { getCodeExpiryDate, getDayCodeDuration } = require('../utils/code');

const DAY_IN_SECONDS = 24 * 60 * 60;

const resolveLicenseType = (code) => getDayCodeDuration(code) ? 'temporary' : 'permanent';

const buildPolicyFromCode = (code, activatedAt = new Date()) => {
  const type = resolveLicenseType(code);

  if (type === 'temporary') {
    return {
      type,
      expiresAt: getCodeExpiryDate(code, activatedAt),
      revalidationIntervalSeconds: DAY_IN_SECONDS,
      offlineGraceSeconds: 2 * DAY_IN_SECONDS,
      clockSkewToleranceSeconds: 5 * 60,
      maxDevices: 1
    };
  }

  return {
    type,
    expiresAt: null,
    revalidationIntervalSeconds: 14 * DAY_IN_SECONDS,
    offlineGraceSeconds: 14 * DAY_IN_SECONDS,
    clockSkewToleranceSeconds: 5 * 60,
    maxDevices: 1
  };
};

module.exports = {
  buildPolicyFromCode,
  resolveLicenseType
};
