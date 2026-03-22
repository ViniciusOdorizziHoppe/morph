const { replicate, MODELS, DEFAULT_PARAMS } = require('../config/replicate');
const cloudinaryService = require('./cloudinaryService');
const PromptBuilder = require('../utils/promptBuilder');
const logger = require('../utils/logger');

class ImageGenerationService {
  constructor() {
    this.models = MODELS;
    this.defaultParams = DEFAULT_PARAMS;
  }
  
  async generateFromImage(inputImageUrl, userPrompt, options = {}) {
    const startTime = Date.now();
    
    try {
      const validation = await cloudinaryService.validateImageUrl(inputImageUrl);
      if (!validation.valid) {
        throw new Error(`Imagem de entrada inválida: ${validation.error}`);
      }
      
      const {
        style = 'professional',
        strength = this.defaultParams.strength,
        aspectRatio = this.defaultParams.aspect_ratio,
        goFast = false
      } = options;
      
      const promptData = PromptBuilder.build(userPrompt, { style, strength });
      
      logger.info('Starting image generation', {
        inputImage: inputImageUrl,
        originalPrompt: userPrompt,
        enhancedPrompt: promptData.prompt,
        strength
      });
      
      const prediction = await replicate.run(this.models.primary, {
        input: {
          image: inputImageUrl,
          prompt: promptData.prompt,
          prompt_strength: parseFloat(strength), // fofr usa prompt_strength
          num_inference_steps: goFast ? 20 : 28,
          guidance_scale: this.defaultParams.guidance_scale,
          output_format: this.defaultParams.output_format,
          output_quality: this.defaultParams.output_quality,
          disable_safety_checker: true
        }
      });
      
      if (!prediction || !prediction.output) {
        throw new Error('API retornou resposta vazia');
      }
      
      const processingTime = (Date.now() - startTime) / 1000;
      
      logger.info('Image generation completed', {
        processingTime,
        outputUrl: prediction.output
      });
      
      return {
        success: true,
        outputUrl: Array.isArray(prediction.output) ? prediction.output[0] : prediction.output,
        metadata: {
          originalPrompt: userPrompt,
          enhancedPrompt: promptData.prompt,
          negativePrompt: promptData.negativePrompt,
          strength,
          style,
          aspectRatio,
          model: this.models.primary,
          processingTime
        }
      };
    } catch (error) {
      logger.error('Image generation failed:', error);
      
      if (!error.message.includes('inválido') && !error.message.includes('Prompt')) {
        return this.generateWithFallback(inputImageUrl, userPrompt, options);
      }
      
      throw error;
    }
  }
  
  async generateWithFallback(inputImageUrl, userPrompt, options) {
    logger.warn('Trying fallback model');
    
    try {
      const promptData = PromptBuilder.build(userPrompt, {
        style: options.style || 'professional',
        strength: options.strength
      });
      
      const prediction = await replicate.run(this.models.secondary, {
        input: {
          image: inputImageUrl,
          prompt: promptData.prompt,
          prompt_strength: parseFloat(options.strength) || 0.75,
          num_inference_steps: 20,
          guidance_scale: 3.5,
          disable_safety_checker: true
        }
      });
      
      if (!prediction || !prediction.output) {
        throw new Error('Fallback também falhou');
      }
      
      return {
        success: true,
        outputUrl: Array.isArray(prediction.output) ? prediction.output[0] : prediction.output,
        metadata: {
          ...promptData,
          model: this.models.secondary,
          isFallback: true
        }
      };
    } catch (error) {
      logger.error('Fallback generation failed:', error);
      throw new Error('Todos os modelos de IA falharam. Tente novamente mais tarde.');
    }
  }
}

module.exports = new ImageGenerationService();