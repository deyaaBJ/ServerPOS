const express = require('express');
const router = express.Router();
const activationController = require('../controllers/activationController');
const { validateActivation } = require('../middleware/validator');

router.post('/', validateActivation, activationController.activate);

module.exports = router;