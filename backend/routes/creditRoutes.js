const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const creditController = require('../controllers/creditController');

router.get('/balance', auth, creditController.getBalance.bind(creditController));
router.get('/history', auth, creditController.getHistory.bind(creditController));

module.exports = router;