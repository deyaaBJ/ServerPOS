const express = require('express');
const router = express.Router();
const activationController = require('../controllers/activationController');
const {
  validateActivation,
  validateActivationRequest,
  validateActivationRequestStatus
} = require('../middleware/validator');

router.post('/request', validateActivationRequest, activationController.createRequest);
router.get('/request/:requestId', validateActivationRequestStatus, activationController.getRequestStatus);
router.post('/', validateActivation, activationController.activate);

module.exports = router;
