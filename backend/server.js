require('dotenv').config();

const app = require('./app');
const connectDB = require('./config/database');
const queueService = require('./services/queueService');
const processImageGenerationJob = require('./jobs/imageGenerationJob');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3001;

// Conectar ao banco de dados
connectDB();

// Configurar processador da fila (worker)
const imageQueue = queueService.getQueue();
imageQueue.process('generate-image', 2, processImageGenerationJob); // 2 workers concorrentes

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  // Fechar fila graciosamente
  await imageQueue.close();
  
  process.exit(0);
});

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});