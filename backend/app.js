const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const errorHandler = require('./middleware/errorHandler');
const imageRoutes = require('./routes/imageRoutes');
const creditRoutes = require('./routes/creditRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();

// CORS - Configuração única e correta
const allowedOrigins = [
    'https://morph-one-tan.vercel.app',
    'https://morph.vercel.app',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://localhost:5173'
];

app.use(cors({
    origin: function (origin, callback) {
        // Permitir requisições sem origin (como apps mobile, curl, postman)
        if (!origin) return callback(null, true);
        
        // Permitir qualquer subdomínio do vercel.app
        if (origin.includes('vercel.app')) {
            return callback(null, true);
        }
        
        // Permitir origens na lista
        if (allowedOrigins.indexOf(origin) !== -1) {
            return callback(null, true);
        }
        
        // Para desenvolvimento, permitir todas as origens
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    optionsSuccessStatus: 200
}));

app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, message: 'Muitas requisicoes' }
});
app.use('/api/', limiter);

// Body parsing
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/credits', creditRoutes);

// Legacy routes
app.post('/api/transform', (req, res) => {
    res.redirect(307, '/api/images/generate');
});

app.get('/api/historico', (req, res) => {
    res.redirect(307, '/api/images/generations');
});

// 404
app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Rota nao encontrada' });
});

// Error handler
app.use(errorHandler);

module.exports = app;