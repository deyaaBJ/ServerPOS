const { body, param, validationResult } = require('express-validator');

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
    .matches(/^[A-Z0-9-_]+$/i).withMessage('Code can only contain letters, numbers, hyphens and underscores')
    .customSanitizer(value => value.toUpperCase()),
  handleValidationErrors
];

const validateChangePassword = [
  body('currentPassword')
    .trim()
    .notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .trim()
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d)/).withMessage('Password must contain letters and numbers'),
  body('confirmPassword')
    .trim()
    .notEmpty().withMessage('Confirm password is required')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
  handleValidationErrors
];

const validateActivation = [
  body('code')
    .trim()
    .notEmpty().withMessage('Code is required'),
  body('deviceId')
    .trim()
    .notEmpty().withMessage('Device ID is required')
    .isLength({ min: 3, max: 100 }).withMessage('Invalid device ID'),
  handleValidationErrors
];

const validateDeleteCode = [
  param('code')
    .trim()
    .notEmpty().withMessage('Code parameter is required'),
  handleValidationErrors
];

module.exports = {
  validateLogin,
  validateAddCode,
  validateChangePassword,
  validateActivation,
  validateDeleteCode
};