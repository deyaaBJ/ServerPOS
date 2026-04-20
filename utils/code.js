const CODE_PATTERN = /^[A-Z0-9_-]+$/;

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const isValidCode = (value) => CODE_PATTERN.test(normalizeCode(value));

module.exports = {
  CODE_PATTERN,
  normalizeCode,
  isValidCode
};
