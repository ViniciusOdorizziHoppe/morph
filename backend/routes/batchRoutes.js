const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { uploadMultiple, handleUploadError } = require('../middleware/upload');
const imageController = require('../controllers/imageController');

router.post(
  '/generate',
  auth,
  uploadMultiple,
  handleUploadError,
  imageController.batchGenerate.bind(imageController)
);

router.get('/:batchId', auth, imageController.getBatchStatus.bind(imageController));

module.exports = router;
