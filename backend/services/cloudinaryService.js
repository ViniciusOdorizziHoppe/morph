const { cloudinary, UPLOAD_PRESETS } = require('../config/cloudinary');
const logger = require('../utils/logger');

class CloudinaryService {
  async uploadUserImage(filePath, userId) {
    try {
      const result = await cloudinary.uploader.upload(filePath, {
        ...UPLOAD_PRESETS.userUploads,
        folder: `morph_uploads/${userId}`,
        type: 'upload',
        access_mode: 'public',
        context: {
          userId: userId.toString(),
          uploadedAt: new Date().toISOString()
        }
      });

      logger.info(`Image uploaded for user ${userId}: ${result.public_id}`);

      return {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes
      };
    } catch (error) {
      logger.error('Cloudinary upload error:', error);
      throw new Error('Falha ao fazer upload da imagem');
    }
  }

  async uploadGeneratedImage(imageUrl, userId, generationId) {
    try {
      const result = await cloudinary.uploader.upload(imageUrl, {
        ...UPLOAD_PRESETS.generatedImages,
        folder: `morph_generated/${userId}`,
        public_id: `gen_${generationId}`,
        overwrite: true,
        context: {
          userId: userId.toString(),
          generationId: generationId.toString(),
          createdAt: new Date().toISOString()
        }
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format
      };
    } catch (error) {
      logger.error('Cloudinary generated upload error:', error);
      throw new Error('Falha ao salvar imagem gerada');
    }
  }

  async validateImageUrl(url) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      
      if (!response.ok) {
        return { valid: false, error: 'URL not accessible' };
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.startsWith('image/')) {
        return { valid: false, error: 'URL is not an image' };
      }

      return { valid: true, contentType };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  async deleteImage(publicId) {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result.result === 'ok';
    } catch (error) {
      logger.error('Cloudinary delete error:', error);
      return false;
    }
  }
}

module.exports = new CloudinaryService();