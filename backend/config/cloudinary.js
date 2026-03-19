const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

const UPLOAD_PRESETS = {
  userUploads: {
    folder: 'morph_uploads',
    resource_type: 'image',
    type: 'upload',
    access_mode: 'public',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 1024, height: 1024, crop: 'limit' },
      { quality: 'auto:good' }
    ],
    overwrite: false,
    unique_filename: true
  },
  generatedImages: {
    folder: 'morph_generated',
    resource_type: 'image',
    type: 'upload',
    access_mode: 'public',
    transformation: [
      { quality: 'auto:best' },
      { fetch_format: 'auto' }
    ]
  }
};

module.exports = { cloudinary, UPLOAD_PRESETS };