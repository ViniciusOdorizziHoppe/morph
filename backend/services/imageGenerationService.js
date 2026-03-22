const { replicate, MODELS, DEFAULT_PARAMS } = require('../config/replicate');
const cloudinaryService = require('./cloudinaryService');
const PromptBuilder = require('../utils/promptBuilder');
const logger = require('../utils/logger');

// Normaliza o output do replicate.run():
// Pode ser FileOutput (.url()), array de FileOutput, ou string
function extractUrl(output) {
  if (!output) return null;
  if (Array.isArray(output)) output = output[0];
  if (!output) return null;
  if (typeof output === 'object' && typeof output.url === 'function') {
    return output.url().href;
  }
  return String(output);
}

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

      // flux-kontext-pro: replicate.run() retorna o output diretamente
      const rawOutput = await replicate.run(this.models.primary, {
        input: {
          input_image: inputImageUrl,
          prompt: promptData.prompt,
          aspect_ratio: aspectRatio || 'match_input_image',
          output_format: this.defaultParams.output_format,
          output_quality: this.defaultParams.output_quality,
          safety_tolerance: 5
        }
      });

      const outputUrl = extractUrl(rawOutput);

      if (!outputUrl) {
        throw new Error('API retornou resposta vazia');
      }

      const processingTime = (Date.now() - startTime) / 1000;

      logger.info('Image generation completed', {
        processingTime,
        outputUrl
      });

      return {
        success: true,
        outputUrl,
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
      logger.error('Image generation failed:', error.message);

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

      const rawOutput = await replicate.run(this.models.secondary, {
        input: {
          input_image: inputImageUrl,
          prompt: promptData.prompt,
          aspect_ratio: options.aspectRatio || 'match_input_image',
          output_format: 'png',
          output_quality: 80,
          safety_tolerance: 5
        }
      });

      const outputUrl = extractUrl(rawOutput);

      if (!outputUrl) {
        throw new Error('Fallback também falhou');
      }

      return {
        success: true,
        outputUrl,
        metadata: {
          ...promptData,
          model: this.models.secondary,
          isFallback: true
        }
      };

    } catch (error) {
      logger.error('Fallback generation failed:', error.message);
      throw new Error('Todos os modelos de IA falharam. Tente novamente mais tarde.');
    }
  }
}

module.exports = new ImageGenerationService();