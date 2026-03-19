const { cloudinary, UPLOAD_PRESETS } = require('../config/cloudinary');
const logger = require('../utils/logger');

class CloudinaryService {
  /**
   * Upload de imagem do usuário
   */
  async uploadUserImage(filePath, userId) {
    try {
      const result = await cloudinary.uploader.upload(filePath, {
        ...UPLOAD_PRESETS.userUploads,
        folder: `morph_uploads/${userId}`,
        // Garantir URL permanente e pública
        type: 'upload',
        access_mode: 'public',
        // Adicionar metadata
        context: {
          userId: userId.toString(),
          uploadedAt: new Date().toISOString()
        }
      });

      logger.info(`Image uploaded for user ${userId}: ${result.public_id}`);

      return {
        url: result.secure_url,  // URL HTTPS permanente
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

  /**
   * Upload de imagem gerada pela IA
   */
  async uploadGeneratedImage(imageUrl, userId, generationId) {
    try {
      // Verificar se a URL é acessível
      const response = await fetch(imageUrl, { method: 'HEAD' });
      if (!response.ok) {
        throw new Error('Generated image URL not accessible');
      }

      const result = await cloudinary.uploader.upload(imageUrl, {
        ...UPLOAD_PRESETS.generatedImages,
        folder: `morph_generated/${userId}`,
        public_id: `gen_${generationId}`,  // Nome previsível
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

  /**
   * Verificar se URL é válida e acessível
   */
  async validateImageUrl(url) {
    try {
      const response = await fetch(url, { 
        method: 'HEAD',
        timeout: 5000 
      });
      
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

  /**
   * Deletar imagem
   */
  async deleteImage(publicId) {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result.result === 'ok';
    } catch (error) {
      logger.error('Cloudinary delete error:', error);
      return false;
    }
  }

  /**
   * Gerar URL otimizada para diferentes dispositivos
   */
  getOptimizedUrl(publicId, options = {}) {
    const {
      width = 1024,
      quality = 'auto',
      format = 'auto'
    } = options;

    return cloudinary.url(publicId, {
      width,
      quality,
      fetch_format: format,
      crop: 'limit'
    });
  }
}

module.exports = new CloudinaryService();