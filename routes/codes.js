const express = require('express');
const router = express.Router();
const codeController = require('../controllers/codeController');
const { adminOnly } = require('../middleware/auth');
const { validateAddCode, validateDeleteCode } = require('../middleware/validator');

router.get('/', adminOnly, codeController.getAllCodes);
router.post('/add', adminOnly, validateAddCode, codeController.addCode);
router.delete('/:code', adminOnly, validateDeleteCode, codeController.deleteCode);
router.get('/:code', adminOnly, codeController.getCodeDetails);

module.exports = router;