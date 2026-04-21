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
  validateApproveActivationRequest,
  validateRejectActivationRequest,
  validateDeactivateActivationRequest,
  validateDeleteCode
};
