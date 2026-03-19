const imageGenerationService = require('../services/imageGenerationService');
const cloudinaryService = require('../services/cloudinaryService');
const creditService = require('../services/creditService');
const Generation = require('../models/Generation');
const logger = require('../utils/logger');

/**
 * Processador de jobs de geração de imagem
 * Este é o worker que roda em processo separado ou servidor dedicado
 */
async function processImageGenerationJob(job) {
  const { 
    generationId, 
    userId, 
    inputImageUrl, 
    prompt, 
    settings 
  } = job.data;

  const startTime = Date.now();
  
  logger.info(`Starting job processing`, { jobId: job.id, generationId });

  try {
    // 1. Atualizar status para 'processing'
    const generation = await Generation.findById(generationId);
    if (!generation) {
      throw new Error('Geração não encontrada no banco de dados');
    }
    
    generation.status = 'processing';
    generation.jobId = job.id.toString();
    await generation.save();

    // 2. CHAMADA PRINCIPAL: Gerar imagem
    const result = await imageGenerationService.generateFromImage(
      inputImageUrl,
      prompt.original,
      {
        style: settings.style,
        strength: settings.strength,
        aspectRatio: settings.aspectRatio,
        scene: settings.scene,
        goFast: false // Priorizar qualidade no processamento em fila
      }
    );

    // 3. Upload do resultado para Cloudinary
    const uploadResult = await cloudinaryService.uploadGeneratedImage(
      result.outputUrl,
      userId,
      generationId
    );

    // 4. Atualizar geração como completa
    await generation.markCompleted(
      uploadResult.url,
      uploadResult.publicId,
      {
        width: uploadResult.width,
        height: uploadResult.height,
        format: uploadResult.format
      }
    );

    // 5. Calcular tempos
    const processingTime = (Date.now() - startTime) / 1000;
    generation.processingTime = processingTime;
    generation.queueTime = (generation.createdAt - job.timestamp) / 1000;
    await generation.save();

    logger.info(`Job completed successfully`, {
      jobId: job.id,
      generationId,
      processingTime,
      outputUrl: uploadResult.url
    });

    return {
      success: true,
      outputUrl: uploadResult.url,
      processingTime,
      generationId
    };

  } catch (error) {
    logger.error(`Job failed`, {
      jobId: job.id,
      generationId,
      error: error.message,
      stack: error.stack
    });

    // Marcar como falho no banco
    const generation = await Generation.findById(generationId);
    if (generation) {
      await generation.markFailed(error.message);
      
      // Reembolsar crédito se foi erro do sistema (não erro do usuário)
      const isUserError = error.message.includes('Prompt') || 
                         error.message.includes('inválido') ||
                         error.message.includes('Imagem');
      
      if (!isUserError) {
        try {
          await creditService.refundCredit(userId, generationId, error.message);
          logger.info(`Credit refunded for failed generation`, { generationId });
        } catch (refundError) {
          logger.error(`Failed to refund credit`, { generationId, error: refundError.message });
        }
      }
    }

    // Lançar erro para Bull tentar novamente (se houver tentativas restantes)
    throw error;
  }
}

// Exportar para uso no processor
module.exports = processImageGenerationJob;