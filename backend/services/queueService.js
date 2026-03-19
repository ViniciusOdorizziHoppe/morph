const Queue = require('bull');
const logger = require('../utils/logger');

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD
};

const imageGenerationQueue = new Queue('image-generation', {
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

class QueueService {
  async addGenerationJob(data) {
    const { generationId, userId, inputImageUrl, prompt, settings, priority = 5 } = data;

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