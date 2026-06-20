const { body, param, query, validationResult } = require('express-validator');
const { DAY_CODE_PATTERN, normalizeCode } = require('../utils/code');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg
      }))
    });
  }
  next();
};

const validateLogin = [
  body('key')
    .trim()
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 1 }).withMessage('Password cannot be empty'),
  handleValidationErrors
];

const validateAddCode = [
  body('code')
    .trim()
    .notEmpty().withMessage('Code is required')
    .isLength({ min: 3, max: 50 }).withMessage('Code must be 3-50 characters')
    .custom((value) => {
      const normalizedCode = normalizeCode(value);
      const dayMatch = normalizedCode.match(DAY_CODE_PATTERN);

      if (dayMatch && Number.parseInt(dayMatch[1], 10) <= 0) {
        throw new Error('DAY code must contain a number greater than 0');
      }

      return true;
    })
    .customSanitizer(normalizeCode),
  handleValidationErrors
];

const validateChangePassword = [
  body('currentPassword')
    .notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d)/).withMessage('Password must contain letters and numbers'),
  body('confirmPassword')
    .optional()
    .custom((value, { req }) => {
      if (value === undefined || value === null || value === '') {
        return true;
      }
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
  handleValidationErrors
];

const validateActivation = [
  body('requestId')
    .trim()
    .notEmpty().withMessage('Request ID is required')
    .isMongoId().withMessage('Invalid request ID'),
  body('code')
    .trim()
    .notEmpty().withMessage('Code is required')
    .isLength({ min: 3, max: 50 }).withMessage('Code must be 3-50 characters')
    .custom((value) => {
      const normalizedCode = normalizeCode(value);
      const dayMatch = normalizedCode.match(DAY_CODE_PATTERN);

      if (dayMatch && Number.parseInt(dayMatch[1], 10) <= 0) {
        throw new Error('DAY code must contain a number greater than 0');
      }

      return true;
    })
    .customSanitizer(normalizeCode),
  body('deviceId')
    .trim()
    .notEmpty().withMessage('Device ID is required')
    .isLength({ min: 3, max: 100 }).withMessage('Invalid device ID'),
  body('deviceFingerprint')
    .optional()
    .trim()
    .isLength({ min: 8, max: 512 }).withMessage('Invalid device fingerprint'),
  handleValidationErrors
];

const validateActivationRequest = [
  body('deviceId')
    .trim()
    .notEmpty().withMessage('Device ID is required')
    .isLength({ min: 3, max: 100 }).withMessage('Invalid device ID'),
  handleValidationErrors
];

const validateActivationRequestStatus = [
  param('requestId')
    .trim()
    .notEmpty().withMessage('Request ID is required')
    .isMongoId().withMessage('Invalid request ID'),
  query('deviceId')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 }).withMessage('Invalid device ID'),
  handleValidationErrors
];

const validateActivationDeviceStatus = [
  query('deviceId')
    .trim()
    .notEmpty().withMessage('Device ID is required')
    .isLength({ min: 3, max: 100 }).withMessage('Invalid device ID'),
  handleValidationErrors
];

const validateActivationDeviceStatusBody = [
  body('deviceId')
    .trim()
    .notEmpty().withMessage('deviceId is required')
    .isLength({ min: 3, max: 100 }).withMessage('deviceId is required'),
  handleValidationErrors
];

const validateLicenseValidate = [
  body('deviceId')
    .trim()
    .notEmpty().withMessage('Device ID is required')
    .isLength({ min: 3, max: 100 }).withMessage('Invalid device ID'),
  body('licenseToken')
    .trim()
    .notEmpty().withMessage('License token is required')
    .isLength({ min: 32, max: 4096 }).withMessage('Invalid license token'),
  body('deviceFingerprint')
    .optional()
    .trim()
    .isLength({ min: 8, max: 512 }).withMessage('Invalid device fingerprint'),
  body('clientTime')
    .optional()
    .isISO8601().withMessage('clientTime must be an ISO 8601 date'),
  handleValidationErrors
];

const validateLicenseCheckDevice = [
  body('deviceId')
    .trim()
    .notEmpty().withMessage('Device ID is required')
    .isLength({ min: 3, max: 100 }).withMessage('Invalid device ID'),
  body('code')
    .optional()
    .trim()
    .isLength({ min: 3, max: 50 }).withMessage('Code must be 3-50 characters')
    .customSanitizer(normalizeCode),
  body('licenseToken')
    .optional()
    .trim()
    .isLength({ min: 32, max: 4096 }).withMessage('Invalid license token'),
  body('deviceFingerprint')
    .optional()
    .trim()
    .isLength({ min: 8, max: 512 }).withMessage('Invalid device fingerprint'),
  body().custom((value) => {
    if (!value?.code && !value?.licenseToken) {
      throw new Error('Either code or licenseToken is required');
    }
    return true;
  }),
  handleValidationErrors
];

const validateLicenseRevoke = [
  body('code')
    .trim()
    .notEmpty().withMessage('Code is required')
    .isLength({ min: 3, max: 50 }).withMessage('Code must be 3-50 characters')
    .customSanitizer(normalizeCode),
  body('reason')
    .trim()
    .notEmpty().withMessage('Reason is required')
    .isLength({ min: 3, max: 250 }).withMessage('Reason must be 3-250 characters'),
  handleValidationErrors
];

const validateApproveActivationRequest = [
  param('requestId')
    .trim()
    .notEmpty().withMessage('Request ID is required')
    .isMongoId().withMessage('Invalid request ID'),
  body('code')
    .trim()
    .notEmpty().withMessage('Code is required')
    .isLength({ min: 3, max: 50 }).withMessage('Code must be 3-50 characters')
    .custom((value) => {
      const normalizedCode = normalizeCode(value);
      const dayMatch = normalizedCode.match(DAY_CODE_PATTERN);

      if (dayMatch && Number.parseInt(dayMatch[1], 10) <= 0) {
        throw new Error('DAY code must contain a number greater than 0');
      }

      return true;
    })
    .customSanitizer(normalizeCode),
  handleValidationErrors
];

const validateRejectActivationRequest = [
  param('requestId')
    .trim()
    .notEmpty().withMessage('Request ID is required')
    .isMongoId().withMessage('Invalid request ID'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 250 }).withMessage('Reason cannot exceed 250 characters'),
  handleValidationErrors
];

const validateDeactivateActivationRequest = [
  param('requestId')
    .trim()
    .notEmpty().withMessage('Request ID is required')
    .isMongoId().withMessage('Invalid request ID'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 250 }).withMessage('Reason cannot exceed 250 characters'),
  handleValidationErrors
];

const validateDeleteCode = [
  param('code')
    .trim()
    .notEmpty().withMessage('Code parameter is required')
    .isLength({ min: 3, max: 50 }).withMessage('Code must be 3-50 characters')
    .customSanitizer(normalizeCode),
  handleValidationErrors
];

module.exports = {
  validateLogin,
  validateAddCode,
  validateChangePassword,
  validateActivation,
  validateActivationRequest,
  validateActivationRequestStatus,
  validateActivationDeviceStatus,
  validateActivationDeviceStatusBody,
  validateLicenseValidate,
  validateLicenseCheckDevice,
  validateLicenseRevoke,
  validateApproveActivationRequest,
  validateRejectActivationRequest,
  validateDeactivateActivationRequest,
  validateDeleteCode
};
