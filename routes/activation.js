const express = require('express');
const router = express.Router();
const activationController = require('../controllers/activationController');
const {
  validateActivation,
  validateActivationRequest,
  validateActivationRequestStatus,
  validateLicenseValidate,
  validateLicenseCheckDevice
} = require('../middleware/validator');
const {
  activationRateLimit,
  revalidationRateLimit,
  failedValidationRateLimit
} = require('../middleware/licenseRateLimits');

router.post('/request', validateActivationRequest, activationController.createRequest);
router.get('/request/:requestId', validateActivationRequestStatus, activationController.getRequestStatus);
router.post('/', activationRateLimit, validateActivation, activationController.activate);
router.post('/device/status', validateLicenseCheckDevice, activationController.getDeviceActivationStatus);
router.post('/license/validate', revalidationRateLimit, validateLicenseValidate, activationController.validateLicense);
router.post('/license/revalidate', revalidationRateLimit, validateLicenseValidate, activationController.revalidateLicense);
router.post('/license/status', failedValidationRateLimit, validateLicenseCheckDevice, activationController.getLicenseStatus);
router.post('/license/refresh-token', revalidationRateLimit, validateLicenseValidate, activationController.refreshToken);
router.post('/license/check-device', failedValidationRateLimit, validateLicenseCheckDevice, activationController.checkDeviceLicense);

module.exports = router;
