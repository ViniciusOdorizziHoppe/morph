const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { uploadSingle, handleUploadError } = require('../middleware/upload');
const { validateGenerationRequest, handleValidationErrors } = require('../utils/validators');
const imageController = require('../controllers/imageController');

router.post(
  '/generate',
  auth,
  uploadSingle,
  handleUploadError,
  validateGenerationRequest,
  handleValidationErrors,
  imageController.uploadAndGenerate.bind(imageController)
);

router.get('/generations', auth, imageController.getUserGenerations.bind(imageController));
router.get('/generations/:generationId', auth, imageController.getGenerationStatus.bind(imageController));

module.exports = router;
