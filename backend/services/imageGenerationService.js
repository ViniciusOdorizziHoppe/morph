const { replicate, MODELS, DEFAULT_PARAMS } = require('../config/replicate');
const cloudinaryService = require('./cloudinaryService');
const PromptBuilder = require('../utils/promptBuilder');
const logger = require('../utils/logger');

class ImageGenerationService {
  constructor() {
    this.models = MODELS;
    this.defaultParams = DEFAULT_PARAMS;
  }

  /**
   * Gera imagem a partir de referência (img2img) - MÉTODO PRINCIPAL CORRIGIDO
   */
  async generateFromImage(inputImageUrl, userPrompt, options = {}) {
    const startTime = Date.now();
    
    try {
      // 1. VALIDAÇÃO CRÍTICA: Verificar se a imagem é acessível
      const validation = await cloudinaryService.validateImageUrl(inputImageUrl);
      if (!validation.valid) {
        throw new Error(`Imagem de entrada inválida: ${validation.error}`);
      }

      // 2. CONSTRUIR PROMPT OTIMIZADO
      const {
        style = 'professional',
        strength = this.defaultParams.strength,
        aspectRatio = this.defaultParams.aspect_ratio,
        scene = null,
        goFast = false
      } = options;

      // Validação do prompt
      const validationPrompt = PromptBuilder.validate(userPrompt);
      if (!validationPrompt.isValid) {
        throw new Error(`Prompt inválido: ${validationPrompt.errors.join(', ')}`);
      }

      // Construir prompt final
      const promptData = PromptBuilder.build(userPrompt, {
        style,
        scene,
        strength,
        preserveOriginal: true
      });

      logger.info('Starting image generation', {
        inputImage: inputImageUrl,
        originalPrompt: userPrompt,
        enhancedPrompt: promptData.prompt,
        strength,
        model: this.models.primary
      });

      // 3. CHAMADA CORRETA PARA API DE img2img
      // IMPORTANTE: O parâmetro 'image' é OBRIGATÓRIO para img2img funcionar
      const prediction = await replicate.run(this.models.primary, {
        input: {
          // Parâmetro CRÍTICO: a imagem de referência
          image: inputImageUrl,
          
          // Prompt do usuário (obrigatório)
          prompt: promptData.prompt,
          
          // Parâmetro CRÍTICO: strength controla quanto da imagem original é mantida
          // 0.1 = quase igual à original, 1.0 = ignora a imagem
          strength: parseFloat(strength),
          
          // Parâmetros de qualidade
          num_inference_steps: goFast ? 20 : 28,
          guidance_scale: this.defaultParams.guidance_scale,
          aspect_ratio: aspectRatio,
          output_format: this.defaultParams.output_format,
          output_quality: this.defaultParams.output_quality,
          go_fast: goFast
        }
      });

      // 4. VALIDAR RESPOSTA
      if (!prediction || !prediction.output) {
        throw new Error('API retornou resposta vazia');
      }

      const outputUrl = prediction.output;
      
      // 5. VERIFICAR SE A IMAGEM GERADA É VÁLIDA
      const outputValidation = await cloudinaryService.validateImageUrl(outputUrl);
      if (!outputValidation.valid) {
        throw new Error('Imagem gerada inválida ou inacessível');
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
          inferenceSteps: goFast ? 20 : 28,
          guidanceScale: this.defaultParams.guidance_scale,
          processingTime
        }
      };

    } catch (error) {
      logger.error('Image generation failed:', {
        error: error.message,
        inputImageUrl,
        userPrompt,
        stack: error.stack
      });

      // Tentar fallback se o erro não for de validação
      if (!error.message.includes('inválido') && !error.message.includes('Prompt')) {
        return this.generateWithFallback(inputImageUrl, userPrompt, options);
      }

      throw error;
    }
  }

  /**
   * Método de fallback usando modelo secundário
   */
  async generateWithFallback(inputImageUrl, userPrompt, options) {
    logger.warn('Trying fallback model', { primary: this.models.primary });
    
    try {
      const promptData = PromptBuilder.build(userPrompt, {
        style: options.style || 'professional',
        strength: options.strength
      });

      const prediction = await replicate.run(this.models.secondary, {
        input: {
          image: inputImageUrl,
          prompt: promptData.prompt,
          strength: parseFloat(options.strength) || 0.75,
          num_inference_steps: 20, // Mais rápido no fallback
          guidance_scale: 3.5,
          aspect_ratio: options.aspectRatio || '1:1',
          go_fast: true
        }
      });

      if (!prediction || !prediction.output) {
        throw new Error('Fallback também falhou');
      }

      return {
        success: true,
        outputUrl: prediction.output,
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

  /**
   * Método para text-to-image (sem referência) - se precisar no futuro
   */
  async generateFromText(prompt, options = {}) {
    const {
      aspectRatio = '1:1',
      goFast = false
    } = options;

    const prediction = await replicate.run(this.models.primary, {
      input: {
        prompt: prompt,  // Sem parâmetro 'image' = t2i puro
        aspect_ratio: aspectRatio,
        num_inference_steps: goFast ? 20 : 28,
        guidance_scale: 3.5,
        output_format: 'png',
        go_fast: goFast
      }
    });

    return {
      success: true,
      outputUrl: prediction.output,
      metadata: { prompt, aspectRatio }
    };
  }

  /**
   * Health check dos modelos
   */
  async checkModelsHealth() {
    const results = {};
    
    for (const [name, model] of Object.entries(this.models)) {
      try {
        // Tentar um prediction mínimo para verificar disponibilidade
        await replicate.models.get(model);
        results[name] = 'available';
      } catch (error) {
        results[name] = 'unavailable';
      }
    }
    
    return results;
  }
}

module.exports = new ImageGenerationService();