const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { uploadSingle, handleUploadError } = require('../middleware/upload');
const { validateGenerationRequest, handleValidationErrors } = require('../utils/validators');
const imageController = require('../controllers/imageController');

// POST /api/images/generate - Upload e gerar
router.post(
  '/generate',
  auth,
  uploadSingle,
  handleUploadError,
  validateGenerationRequest,
  handleValidationErrors,
  imageController.uploadAndGenerate.bind(imageController)
);

// GET /api/images/generations - Listar gerações
router.get(
  '/generations',
  auth,
  imageController.getUserGenerations.bind(imageController)
);

// GET /api/images/generations/:generationId - Status específico
router.get(
  '/generations/:generationId',
  auth,
  imageController.getGenerationStatus.bind(imageController)
);

// DELETE /api/images/generations/:generationId/cancel - Cancelar
router.delete(
  '/generations/:generationId/cancel',
  auth,
  imageController.cancelGeneration.bind(imageController)
);

// POST /api/images/preview-prompt - Preview de prompt
router.post(
  '/preview-prompt',
  auth,
  imageController.previewPrompt.bind(imageController)
);

module.exports = router;