const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const userController = require('../controllers/userController');

// Rotas de usuário
router.get('/profile', auth, userController.getProfile.bind(userController));
router.put('/profile', auth, userController.updateProfile.bind(userController));
router.get('/stats', auth, userController.getStats.bind(userController));

module.exports = router;
