const rateLimit = require('express-rate-limit');

const buildJsonLimiter = (windowMs, max, message, errorCode) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: errorCode,
        message
      }
    });
  }
});

const activationRateLimit = buildJsonLimiter(15 * 60 * 1000, 25, 'Too many activation attempts', 'RATE_LIMIT_ACTIVATION');
const revalidationRateLimit = buildJsonLimiter(10 * 60 * 1000, 120, 'Too many revalidation attempts', 'RATE_LIMIT_REVALIDATION');
const failedValidationRateLimit = buildJsonLimiter(10 * 60 * 1000, 40, 'Too many failed validation attempts', 'RATE_LIMIT_FAILED_VALIDATION');

module.exports = {
  activationRateLimit,
  revalidationRateLimit,
  failedValidationRateLimit
};
