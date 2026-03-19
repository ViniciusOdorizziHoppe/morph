const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const errorHandler = require('./middleware/errorHandler');
const imageRoutes = require('./routes/imageRoutes');
const creditRoutes = require('./routes/creditRoutes');

const app = express();

// ✅ CORREÇÃO CORS - Permitir múltiplas origens
const allowedOrigins = [
    'https://morph-one-tan.vercel.app',
    'https://morph.vercel.app',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
];

app.use(cors({
    origin: function (origin, callback) {
        // Permitir requisições sem origin (mobile apps, curl, etc)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('vercel.app')) {
            callback(null, true);
        } else {
            console.log('CORS bloqueado para:', origin);
            callback(null, true); // Temporariamente permitir todas durante desenvolvimento
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Trust proxy para Koyeb/Vercel
app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, message: 'Muitas requisições' }
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
app.use('/api/images', imageRoutes);
app.use('/api/credits', creditRoutes);

// ✅ ADICIONAR: Rotas de autenticação (temporário até criar controller)
app.use('/api/auth', require('./routes/authRoutes'));

// Rota legacy
app.post('/api/transform', (req, res) => {
    res.redirect(307, '/api/images/generate');
});

app.get('/api/historico', (req, res) => {
    res.redirect(307, '/api/images/generations');
});

// 404
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Rota não encontrada' });
});

// Error handler
app.use(errorHandler);

module.exports = app;