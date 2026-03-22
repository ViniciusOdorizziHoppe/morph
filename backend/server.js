require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/database');
const queueService = require('./services/queueService');
const processImageGenerationJob = require('./jobs/imageGenerationJob');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3001;

// Conectar DB
connectDB();

// Configurar worker (apenas se Redis estiver configurado)
const imageQueue = queueService.getQueue();
if (imageQueue) {
  imageQueue.process('generate-image', 2, processImageGenerationJob);
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('Shutting down gracefully');
    await imageQueue.close();
    process.exit(0);
  });
}

app.listen(PORT, () => {
  logger.info('Server running on port ' + PORT);
});
