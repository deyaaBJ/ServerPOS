const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { adminOnly } = require('../middleware/auth');
const { validateLogin, validateChangePassword } = require('../middleware/validator');

router.post('/login', validateLogin, adminController.login);
router.post('/change-password', adminOnly, validateChangePassword, adminController.changePassword);
router.get('/stats', adminOnly, adminController.getStats);
router.post('/logout', adminOnly, adminController.logout);

module.exports = router;