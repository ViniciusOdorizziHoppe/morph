const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const errorHandler = require('./middleware/errorHandler');
const imageRoutes = require('./routes/imageRoutes');
const creditRoutes = require('./routes/creditRoutes');

const app = express();

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Muitas requisições' }
});
app.use('/api/', limiter);

const generationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5
});
app.use('/api/images/generate', generationLimiter);

// Body parsing
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/images', imageRoutes);
app.use('/api/credits', creditRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Rota não encontrada' });
});

// Error handler
app.use(errorHandler);

module.exports = app;