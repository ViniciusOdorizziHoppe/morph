const Queue = require('bull');
const logger = require('../utils/logger');
const processImageGenerationJob = require('../jobs/imageGenerationJob');

// Verificar se Redis está configurado
const hasRedisConfig = process.env.REDIS_HOST && process.env.REDIS_HOST.trim() !== '';

let imageGenerationQueue = null;

// Apenas criar a fila se Redis estiver configurado
if (hasRedisConfig) {
  const redisConfig = {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  };
  
  imageGenerationQueue = new Queue('image-generation', {
    redis: redisConfig,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50
    }
  });
  
  imageGenerationQueue.on('completed', (job, result) => {
    logger.info(`Job ${job.id} completed`, { generationId: job.data.generationId });
  });
  
  imageGenerationQueue.on('failed', (job, err) => {
    logger.error(`Job ${job.id} failed`, { generationId: job.data.generationId, error: err.message });
  });
  
  logger.info('Redis queue initialized');
} else {
  logger.info('Redis not configured - using synchronous processing');
}

class QueueService {
  async addGenerationJob(data) {
    const { generationId, userId, inputImageUrl, prompt, settings, priority = 5 } = data;
    
    // Se não há Redis, processar de forma síncrona
    if (!imageGenerationQueue) {
      logger.info('Processing synchronously (no Redis)', { generationId });
      
      // Processar imediatamente em background
      setImmediate(async () => {
        try {
          await processImageGenerationJob({
            id: `sync-${generationId}`,
            data: { generationId, userId, inputImageUrl, prompt, settings }
          });
        } catch (error) {
          logger.error('Synchronous processing error:', error);
        }
      });
      
      return {
        jobId: `sync-${generationId}`,
        queuePosition: 0,
        status: 'processing'
      };
    }
    
    // Usar fila Redis
    const job = await imageGenerationQueue.add(
      'generate-image',
      { generationId, userId, inputImageUrl, prompt, settings },
      {
        priority,
        jobId: generationId.toString(),
        timeout: 120000
      }
    );
    
    return {
      jobId: job.id,
      queuePosition: await imageGenerationQueue.count(),
      status: 'queued'
    };
  }
  
  async getJobStatus(jobId) {
    if (!imageGenerationQueue) {
      return { status: 'processing', exists: true };
    }
    
    const job = await imageGenerationQueue.getJob(jobId);
    if (!job) return { status: 'unknown', exists: false };
    
    const state = await job.getState();
    return {
      status: state,
      exists: true,
      progress: job.progress(),
      attempts: job.attemptsMade,
      failedReason: job.failedReason
    };
  }
  
  async getQueueStats() {
    if (!imageGenerationQueue) {
      return { waiting: 0, active: 0, completed: 0, failed: 0, total: 0 };
    }
    
    const [waiting, active, completed, failed] = await Promise.all([
      imageGenerationQueue.getWaitingCount(),
      imageGenerationQueue.getActiveCount(),
      imageGenerationQueue.getCompletedCount(),
      imageGenerationQueue.getFailedCount()
    ]);
    
    return { waiting, active, completed, failed, total: waiting + active };
  }
  
  getQueue() {
    return imageGenerationQueue;
  }
}

module.exports = new QueueService();
