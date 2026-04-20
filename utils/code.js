const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const DAY_CODE_PATTERN = /^DAY-(\d+)$/i;

const isValidCode = (value) => normalizeCode(value).length >= 3;

const getDayCodeDuration = (value) => {
  const match = normalizeCode(value).match(DAY_CODE_PATTERN);

  if (!match) {
    return null;
  }

  const days = Number.parseInt(match[1], 10);
  return Number.isInteger(days) && days > 0 ? days : null;
};

const getCodeExpiryDate = (value, activatedAt) => {
  const days = getDayCodeDuration(value);

  if (!days || !activatedAt) {
    return null;
  }

  const expiryDate = new Date(activatedAt);
  expiryDate.setDate(expiryDate.getDate() + days);
  return expiryDate;
};

const isCodeExpired = (value, activatedAt, now = new Date()) => {
  const expiryDate = getCodeExpiryDate(value, activatedAt);
  return expiryDate ? now >= expiryDate : false;
};

module.exports = {
  normalizeCode,
  isValidCode,
  DAY_CODE_PATTERN,
  getDayCodeDuration,
  getCodeExpiryDate,
  isCodeExpired
};
