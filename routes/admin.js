const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { adminOnly } = require('../middleware/auth');
const {
  validateLogin,
  validateChangePassword,
  validateActivationRequestStatus,
  validateApproveActivationRequest,
  validateRejectActivationRequest,
  validateDeactivateActivationRequest,
  validateLicenseRevoke
} = require('../middleware/validator');

router.post('/login', validateLogin, adminController.login);
router.post('/change-password', adminOnly, validateChangePassword, adminController.changePassword);
router.get('/stats', adminOnly, adminController.getStats);
router.get('/activation-requests', adminOnly, adminController.getActivationRequests);
router.post(
  '/activation-requests/:requestId/approve',
  adminOnly,
  validateApproveActivationRequest,
  adminController.approveActivationRequest
);
router.post(
  '/activation-requests/:requestId/reject',
  adminOnly,
  validateRejectActivationRequest,
  adminController.rejectActivationRequest
);
router.post(
  '/activation-requests/:requestId/deactivate',
  adminOnly,
  validateDeactivateActivationRequest,
  adminController.deactivateActivationRequest
);
router.post(
  '/licenses/revoke',
  adminOnly,
  validateLicenseRevoke,
  require('../controllers/activationController').revokeLicense
);
router.delete(
  '/activation-requests/:requestId',
  adminOnly,
  validateActivationRequestStatus,
  adminController.archiveActivationRequest
);
router.post('/logout', adminOnly, adminController.logout);

module.exports = router;
