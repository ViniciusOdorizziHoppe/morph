const Generation = require('../models/Generation');
const cloudinaryService = require('../services/cloudinaryService');
const queueService = require('../services/queueService');
const creditService = require('../services/creditService');
const PromptBuilder = require('../utils/promptBuilder');
const logger = require('../utils/logger');

class ImageController {
  /**
   * Upload de imagem e início de geração
   */
  async uploadAndGenerate(req, res, next) {
    try {
      const userId = req.user._id;
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          success: false,
          message: 'Nenhuma imagem enviada'
        });
      }

      const {
        prompt,
        strength = 0.75,
        style = req.user.preferences?.defaultStyle || 'professional',
        aspectRatio = '1:1',
        scene = null
      } = req.body;

      // 1. VALIDAR PROMPT
      const promptValidation = PromptBuilder.validate(prompt);
      if (!promptValidation.isValid) {
        return res.status(400).json({
          success: false,
          message: 'Prompt inválido',
          errors: promptValidation.errors
        });
      }

      // 2. VERIFICAR CRÉDITOS
      const balance = await creditService.getBalance(userId);
      if (balance.credits < 1) {
        return res.status(403).json({
          success: false,
          message: 'Créditos insuficientes',
          currentCredits: balance.credits,
          upgradeUrl: '/pricing'
        });
      }

      // 3. FAZER UPLOAD PARA CLOUDINARY
      let uploadResult;
      try {
        uploadResult = await cloudinaryService.uploadUserImage(file.path, userId);
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: 'Falha ao processar imagem de upload'
        });
      }

      // 4. CONSTRUIR PROMPT OTIMIZADO
      const promptData = PromptBuilder.build(prompt, {
        style,
        scene,
        strength: parseFloat(strength),
        preserveOriginal: true
      });

      // 5. CRIAR REGISTRO DE GERAÇÃO
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
          model: 'flux-1-dev',
          inferenceSteps: 28,
          guidanceScale: 3.5
        },
        status: 'pending'
      });

      await generation.save();

      // 6. CONSUMIR CRÉDITO (transação atômica)
      try {
        await creditService.useCreditForGeneration(userId, generation._id);
      } catch (error) {
        // Rollback: deletar imagem e geração
        await cloudinaryService.deleteImage(uploadResult.publicId);
        await Generation.findByIdAndDelete(generation._id);
        
        return res.status(403).{
          success: false,
          message: error.message
        };
      }

      // 7. ADICIONAR À FILA DE PROCESSAMENTO
      const queueResult = await queueService.addGenerationJob({
        generationId: generation._id,
        userId,
        inputImageUrl: uploadResult.url,
        prompt: { original: prompt },
        settings: {
          style,
          strength: parseFloat(strength),
          aspectRatio,
          scene
        },
        priority: req.user.role === 'admin' ? 1 : 5 // Admin tem prioridade
      });

      // 8. RETORNAR RESPOSTA IMEDIATA
      res.status(202).json({
        success: true,
        message: 'Geração iniciada',
        data: {
          generationId: generation._id,
          status: 'queued',
          queuePosition: queueResult.queuePosition,
          estimatedTime: '30-60 segundos',
          creditsRemaining: balance.credits - 1,
          preview: {
            inputImage: uploadResult.url,
            prompt: promptData.prompt,
            settings: generation.settings
          }
        }
      });

    } catch (error) {
      logger.error('Upload and generate error:', error);
      next(error);
    }
  }

  /**
   * Verificar status de uma geração
   */
  async getGenerationStatus(req, res, next) {
    try {
      const { generationId } = req.params;
      const userId = req.user._id;

      const generation = await Generation.findOne({
        _id: generationId,
        user: userId
      });

      if (!generation) {
        return res.status(404).json({
          success: false,
          message: 'Geração não encontrada'
        });
      }

      // Se ainda está na fila, pegar status atualizado
      let queueStatus = null;
      if (generation.jobId && generation.status === 'pending') {
        queueStatus = await queueService.getJobStatus(generation.jobId);
      }

      res.json({
        success: true,
        data: {
          generationId: generation._id,
          status: generation.status,
          queueStatus: queueStatus?.status,
          inputImage: generation.inputImage.url,
          outputImage: generation.outputImage?.url,
          prompt: {
            original: generation.prompt.original,
            enhanced: generation.prompt.enhanced
          },
          settings: generation.settings,
          createdAt: generation.createdAt,
          completedAt: generation.updatedAt,
          processingTime: generation.processingTime,
          errorMessage: generation.errorMessage
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Listar gerações do usuário
   */
  async getUserGenerations(req, res, next) {
    try {
      const userId = req.user._id;
      const { 
        page = 1, 
        limit = 10, 
        status,
        sortBy = 'createdAt',
        order = 'desc'
      } = req.query;

      const query = { user: userId };
      if (status) query.status = status;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const generations = await Generation.find(query)
        .sort({ [sortBy]: order === 'desc' ? -1 : 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('-prompt.negative'); // Não enviar negative prompt

      const total = await Generation.countDocuments(query);

      res.json({
        success: true,
        data: {
          generations: generations.map(g => ({
            id: g._id,
            status: g.status,
            inputImage: g.inputImage.url,
            outputImage: g.outputImage?.url,
            prompt: g.prompt.original,
            createdAt: g.createdAt,
            processingTime: g.processingTime
          })),
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          }
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancelar geração pendente
   */
  async cancelGeneration(req, res, next) {
    try {
      const { generationId } = req.params;
      const userId = req.user._id;

      const generation = await Generation.findOne({
        _id: generationId,
        user: userId,
        status: { $in: ['pending', 'processing'] }
      });

      if (!generation) {
        return res.status(404).json({
          success: false,
          message: 'Geração não encontrada ou já finalizada'
        });
      }

      // Tentar cancelar na fila
      if (generation.jobId) {
        const cancelResult = await queueService.cancelJob(generation.jobId);
        if (!cancelResult.success) {
          return res.status(400).json({
            success: false,
            message: cancelResult.message
          });
        }
      }

      // Reembolsar crédito
      await creditService.refundCredit(userId, generation._id, 'Cancelado pelo usuário');
      
      generation.status = 'cancelled';
      await generation.save();

      res.json({
        success: true,
        message: 'Geração cancelada e crédito reembolsado'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Preview de como o prompt será processado
   */
  async previewPrompt(req, res, next) {
    try {
      const { prompt, style = 'professional', strength = 0.75, scene = null } = req.body;

      const validation = PromptBuilder.validate(prompt);
      const suggestions = PromptBuilder.suggestImprovements(prompt);
      
      const built = PromptBuilder.build(prompt, {
        style,
        scene,
        strength: parseFloat(strength)
      });

      res.json({
        success: true,
        data: {
          original: prompt,
          enhanced: built.prompt,
          negative: built.negativePrompt,
          isValid: validation.isValid,
          errors: validation.errors,
          suggestions,
          estimatedTokens: built.prompt.split(' ').length
        }
      });

    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ImageController();