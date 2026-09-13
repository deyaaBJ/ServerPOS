const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const DAY_CODE_PATTERN = /^DAY-(\d+)$/i;

// Milliseconds per day constant for accurate date calculations
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

  // FIXED: Use milliseconds instead of setDate/getDate which are timezone-dependent
  // This ensures accurate date calculation regardless of server timezone
  // For DAY-3 with activatedAt: 2026-09-13T19:07:53.673Z
  // Result will be: 2026-09-16T19:07:53.673Z (exactly +72 hours)
  return new Date(activatedAt.getTime() + (days * MS_PER_DAY));
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
