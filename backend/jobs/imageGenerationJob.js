const imageGenerationService = require('../services/imageGenerationService');
const cloudinaryService = require('../services/cloudinaryService');
const creditService = require('../services/creditService');
const Generation = require('../models/Generation');
const logger = require('../utils/logger');

async function processImageGenerationJob(job) {
  const { generationId, userId, inputImageUrl, prompt, settings } = job.data;
  const startTime = Date.now();
  
  try {
    const generation = await Generation.findById(generationId);
    if (!generation) throw new Error('Geração não encontrada');
    
    generation.status = 'processing';
    generation.jobId = job.id?.toString() || `sync-${generationId}`;
    await generation.save();
    
    const result = await imageGenerationService.generateFromImage(
      inputImageUrl,
      prompt.original,
      {
        style: settings.style,
        strength: settings.strength,
        aspectRatio: settings.aspectRatio,
        goFast: false
      }
    );
    
    const uploadResult = await cloudinaryService.uploadGeneratedImage(
      result.outputUrl,
      userId,
      generationId
    );
    
    await generation.markCompleted(uploadResult.url, uploadResult.publicId, {
      width: uploadResult.width,
      height: uploadResult.height,
      format: uploadResult.format
    });
    
    generation.processingTime = (Date.now() - startTime) / 1000;
    await generation.save();
    
    return {
      success: true,
      outputUrl: uploadResult.url,
      processingTime: generation.processingTime
    };
  } catch (error) {
    logger.error(`Job failed`, { jobId: job.id, error: error.message });
    
    const generation = await Generation.findById(generationId);
    if (generation) {
      await generation.markFailed(error.message);
      
      const isUserError = error.message.includes('Prompt') ||
        error.message.includes('inválido') ||
        error.message.includes('Imagem');
      
      if (!isUserError) {
        try {
          await creditService.refundCredit(userId, generationId, error.message);
        } catch (refundError) {
          logger.error('Failed to refund credit', { error: refundError.message });
        }
      }
    }
    
    throw error;
  }
}

module.exports = processImageGenerationJob;
