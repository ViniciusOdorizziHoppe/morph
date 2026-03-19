const Queue = require('bull');
const logger = require('../utils/logger');

// Configuração Redis
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD
};

// Fila principal de geração de imagens
const imageGenerationQueue = new Queue('image-generation', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,                    // Tentar 3 vezes em caso de falha
    backoff: {
      type: 'exponential',
      delay: 2000                   // Esperar 2s, 4s, 8s entre tentativas
    },
    removeOnComplete: 100,        // Manter últimos 100 jobs completos
    removeOnFail: 50              // Manter últimos 50 jobs falhos
  }
});

// Eventos para monitoramento
imageGenerationQueue.on('completed', (job, result) => {
  logger.info(`Job ${job.id} completed`, {
    generationId: job.data.generationId,
    processingTime: result.processingTime
  });
});

imageGenerationQueue.on('failed', (job, err) => {
  logger.error(`Job ${job.id} failed`, {
    generationId: job.data.generationId,
    error: err.message,
    attempts: job.attemptsMade
  });
});

imageGenerationQueue.on('stalled', (job) => {
  logger.warn(`Job ${job.id} stalled`, {
    generationId: job.data.generationId
  });
});

class QueueService {
  /**
   * Adicionar job de geração à fila
   */
  async addGenerationJob(data) {
    const {
      generationId,
      userId,
      inputImageUrl,
      prompt,
      settings,
      priority = 5          // 1-10, menor = mais prioritário
    } = data;

    const job = await imageGenerationQueue.add(
      'generate-image',
      {
        generationId,
        userId,
        inputImageUrl,
        prompt,
        settings
      },
      {
        priority,
        jobId: generationId.toString(),  // ID previsível para rastreamento
        timeout: 120000                     // Timeout de 2 minutos
      }
    );

    logger.info(`Generation job added to queue`, {
      jobId: job.id,
      generationId,
      userId,
      queuePosition: await imageGenerationQueue.count()
    });

    return {
      jobId: job.id,
      queuePosition: await imageGenerationQueue.count(),
      status: 'queued'
    };
  }

  /**
   * Obter status de um job
   */
  async getJobStatus(jobId) {
    const job = await imageGenerationQueue.getJob(jobId);
    
    if (!job) {
      return { status: 'unknown', exists: false };
    }

    const state = await job.getState(); // completed, failed, delayed, active, waiting, etc.
    
    return {
      status: state,
      exists: true,
      progress: job.progress(),
      attempts: job.attemptsMade,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn
    };
  }

  /**
   * Cancelar job pendente
   */
  async cancelJob(jobId) {
    const job = await imageGenerationQueue.getJob(jobId);
    
    if (!job) {
      return { success: false, message: 'Job não encontrado' };
    }

    const state = await job.getState();
    
    if (state === 'completed' || state === 'failed') {
      return { 
        success: false, 
        message: `Não pode cancelar job ${state}` 
      };
    }

    await job.remove();
    
    return { success: true, message: 'Job cancelado' };
  }

  /**
   * Estatísticas da fila
   */
  async getQueueStats() {
    const [
      waiting,
      active,
      completed,
      failed,
      delayed
    ] = await Promise.all([
      imageGenerationQueue.getWaitingCount(),
      imageGenerationQueue.getActiveCount(),
      imageGenerationQueue.getCompletedCount(),
      imageGenerationQueue.getFailedCount(),
      imageGenerationQueue.getDelayedCount()
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed
    };
  }

  /**
   * Limpar jobs antigos
   */
  async cleanOldJobs() {
    await imageGenerationQueue.clean(24 * 3600 * 1000, 'completed'); // 24h
    await imageGenerationQueue.clean(7 * 24 * 3600 * 1000, 'failed'); // 7 dias
    
    return { message: 'Old jobs cleaned' };
  }

  getQueue() {
    return imageGenerationQueue;
  }
}

module.exports = new QueueService();