

# ==========================================
# SCRIPT DE CORREÇÃO DO PROJETO MORPH
# ==========================================

$baseDir = "C:\Users\Vinícius\OneDrive\Documentos\sistemasistema\morph"
$backendDir = Join-Path $baseDir "backend"
$frontendDir = Join-Path $baseDir "frontend"

Write-Host "CORRIGINDO ESTRUTURA DO PROJETO..." -ForegroundColor Green
Write-Host ""

# ==========================================
# 1. VERIFICAR SE EXISTE PASTA BACKEND
# ==========================================
if (!(Test-Path $backendDir)) {
    Write-Host "ERRO: Pasta backend não encontrada!" -ForegroundColor Red
    exit 1
}

# ==========================================
# 2. CRIAR BACKUP DO APP.JS ATUAL
# ==========================================
$appJsPath = Join-Path $backendDir "app.js"
$backupPath = Join-Path $backendDir "app.js.backup.$(Get-Date -Format 'yyyyMMdd_HHmmss')"

if (Test-Path $appJsPath) {
    Copy-Item $appJsPath $backupPath -Force
    Write-Host "✓ Backup criado: app.js.backup" -ForegroundColor Gray
    
    # Verificar se é código de frontend
    $content = Get-Content $appJsPath -Raw
    if ($content -match "document\.getElementById" -or $content -match "window\.showLogin") {
        Write-Host "⚠ Detectado código de frontend no backend/app.js" -ForegroundColor Yellow
    }
}

# ==========================================
# 3. CRIAR APP.JS CORRETO DO BACKEND
# ==========================================

$backendAppJs = @'
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const errorHandler = require('./middleware/errorHandler');
const imageRoutes = require('./routes/imageRoutes');
const creditRoutes = require('./routes/creditRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();

// CORS
const allowedOrigins = [
    'https://morph-one-tan.vercel.app',
    'https://morph.vercel.app',
    'http://localhost:3000',
    'http://localhost:5500'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('vercel.app')) {
            callback(null, true);
        } else {
            callback(null, true);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

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
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Rota não encontrada' });
});

// Error handler
app.use(errorHandler);

module.exports = app;
'@

Set-Content -Path $appJsPath -Value $backendAppJs -Encoding UTF8
Write-Host "✓ backend/app.js restaurado corretamente" -ForegroundColor Green

# ==========================================
# 4. VERIFICAR FRONTEND
# ==========================================
$frontendJsDir = Join-Path $frontendDir "js"
$frontendAppJs = Join-Path $frontendJsDir "app.js"

if (Test-Path $frontendAppJs) {
    $frontendContent = Get-Content $frontendAppJs -Raw
    if ($frontendContent -match "require\('express'\)") {
        Write-Host "⚠ ERRO: frontend/js/app.js contém código de backend!" -ForegroundColor Red
        Write-Host "   Corrija manualmente o frontend" -ForegroundColor Yellow
    } else {
        Write-Host "✓ frontend/js/app.js parece correto" -ForegroundColor Green
    }
} else {
    Write-Host "⚠ frontend/js/app.js não encontrado" -ForegroundColor Yellow
}

# ==========================================
# 5. VERIFICAR ESTRUTURA
# ==========================================
Write-Host ""
Write-Host "ESTRUTURA ATUAL:" -ForegroundColor Cyan

$items = @(
    "backend/app.js",
    "backend/server.js",
    "backend/package.json",
    "frontend/index.html",
    "frontend/js/app.js",
    "frontend/js/api.js"
)

foreach ($item in $items) {
    $path = Join-Path $baseDir $item
    if (Test-Path $path) {
        Write-Host "  ✓ $item" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $item (FALTANDO)" -ForegroundColor Red
    }
}

# ==========================================
# 6. GIT STATUS
# ==========================================
Write-Host ""
Write-Host "GIT STATUS:" -ForegroundColor Cyan
Set-Location $baseDir
git status --short

# ==========================================
# 7. INSTRUÇÕES FINAIS
# ==========================================
Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "PRÓXIMOS PASSOS:" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "1. Verifique se tudo está correto:" -ForegroundColor White
Write-Host "   - backend/app.js deve ter 'require('express')'" -ForegroundColor Gray
Write-Host "   - frontend/js/app.js deve ter 'window.showLogin'" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Commit e push:" -ForegroundColor White
Write-Host "   git add ." -ForegroundColor Yellow
Write-Host "   git commit -m 'fix: corrige app.js do backend'" -ForegroundColor Yellow
Write-Host "   git push" -ForegroundColor Yellow
Write-Host ""
Write-Host "3. O Koyeb vai fazer deploy automaticamente" -ForegroundColor White
Write-Host ""