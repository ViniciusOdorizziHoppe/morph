const Generation = require('../models/Generation');
const cloudinaryService = require('../services/cloudinaryService');
const queueService = require('../services/queueService');
const creditService = require('../services/creditService');
const PromptBuilder = require('../utils/promptBuilder');
const logger = require('../utils/logger');

class ImageController {
  async uploadAndGenerate(req, res, next) {
    try {
      const userId = req.user._id;
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ success: false, message: 'Nenhuma imagem enviada' });
      }
      
      const { prompt, strength = 0.75, style = 'professional', aspectRatio = '1:1' } = req.body;
      
      const promptValidation = PromptBuilder.validate(prompt);
      if (!promptValidation.isValid) {
        return res.status(400).json({ success: false, errors: promptValidation.errors });
      }
      
      const balance = await creditService.getBalance(userId);
      if (balance.credits < 1) {
        return res.status(403).json({
          success: false,
          message: 'Créditos insuficientes',
          currentCredits: balance.credits
        });
      }
      
      let uploadResult;
      try {
        uploadResult = await cloudinaryService.uploadUserImage(file.path, userId);
      } catch (error) {
        return res.status(500).json({ success: false, message: 'Falha ao processar imagem' });
      }
      
      const promptData = PromptBuilder.build(prompt, { style, strength: parseFloat(strength) });
      
      const generation = new Generation({
        user: userId,
        inputImage: {
          url: uploadResult.url,
          publicId: uploadResult.publicId,
          width: uploadResult.width,
          height: uploadResult.height,
          format: uploadResult.format
        },
        prompt: {
          original: prompt,
          enhanced: promptData.prompt,
          negative: promptData.negativePrompt
        },
        settings: {
          style,
          strength: parseFloat(strength),
          aspectRatio,
          model: 'flux-1-dev'
        },
        status: 'pending'
      });
      await generation.save();
      
      try {
        await creditService.useCreditForGeneration(userId, generation._id);
      } catch (error) {
        await cloudinaryService.deleteImage(uploadResult.publicId);
        await Generation.findByIdAndDelete(generation._id);
        return res.status(403).json({ success: false, message: error.message });
      }
      
      const queueResult = await queueService.addGenerationJob({
        generationId: generation._id,
        userId,
        inputImageUrl: uploadResult.url,
        prompt: { original: prompt },
        settings: { style, strength: parseFloat(strength), aspectRatio },
        priority: req.user.role === 'admin' ? 1 : 5
      });
      
      res.status(202).json({
        success: true,
        message: 'Geração iniciada',
        data: {
          generationId: generation._id,
          status: 'queued',
          queuePosition: queueResult.queuePosition,
          creditsRemaining: balance.credits - 1
        }
      });
    } catch (error) {
      logger.error('Upload and generate error:', error);
      next(error);
    }
  }
  
  async getGenerationStatus(req, res, next) {
    try {
      const { generationId } = req.params;
      const generation = await Generation.findOne({ _id: generationId, user: req.user._id });
      
      if (!generation) {
        return res.status(404).json({ success: false, message: 'Geração não encontrada' });
      }
      
      let queueStatus = null;
      if (generation.jobId && generation.status === 'pending') {
        queueStatus = await queueService.getJobStatus(generation.jobId);
      }
      
      res.json({
        success: true,
        data: {
          generationId: generation._id,
          status: generation.status,
          inputImage: generation.inputImage.url,
          outputImage: generation.outputImage?.url,
          prompt: generation.prompt.original,
          settings: generation.settings
        }
      });
    } catch (error) {
      next(error);
    }
  }
  
  async getUserGenerations(req, res, next) {
    try {
      const generations = await Generation.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .limit(20);
      
      res.json({
        success: true,
        data: generations.map(g => ({
          id: g._id,
          status: g.status,
          inputImage: g.inputImage.url,
          outputImage: g.outputImage?.url,
          prompt: g.prompt.original,
          createdAt: g.createdAt
        }))
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ImageController();
