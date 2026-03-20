@echo off
chcp 65001 >nul
echo ==========================================
echo  CORRIGINDO BACKEND DO MORPH
echo ==========================================
echo.

set "BACKEND_DIR=C:\Users\Vinícius\OneDrive\Documentos\sistemasistema\morph\backend"
set "APP_JS=%BACKEND_DIR%\app.js"

echo Verificando backend em:
echo %BACKEND_DIR%
echo.

if not exist "%BACKEND_DIR%" (
    echo ERRO: Pasta backend nao encontrada!
    pause
    exit /b 1
)

echo Criando backup...
copy "%APP_JS%" "%APP_JS%.backup.%date:~-4,4%%date:~-10,2%%date:~-7,2%.txt" >nul
echo Backup criado.
echo.

echo Criando app.js correto do backend...

(
echo const express = require^('express'^);
echo const cors = require^('cors'^);
echo const compression = require^('compression'^);
echo const rateLimit = require^('express-rate-limit'^);
echo.
echo const errorHandler = require^('./middleware/errorHandler'^);
echo const imageRoutes = require^('./routes/imageRoutes'^);
echo const creditRoutes = require^('./routes/creditRoutes'^);
echo const authRoutes = require^('./routes/authRoutes'^);
echo.
echo const app = express^(^);
echo.
echo // CORS
echo const allowedOrigins = [
echo     'https://morph-one-tan.vercel.app',
echo     'https://morph.vercel.app',
echo     'http://localhost:3000',
echo     'http://localhost:5500'
echo ];
echo.
echo app.use^(cors^({
echo     origin: function ^(origin, callback^) {
echo         if ^(!origin^) return callback^(null, true^);
echo         if ^(allowedOrigins.indexOf^(origin^) ^!== -1 ^|^| origin.includes^('vercel.app'^)^) {
echo             callback^(null, true^);
echo         } else {
echo             callback^(null, true^);
echo         }
echo     },
echo     credentials: true,
echo     methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
echo     allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
echo }^)^);
echo.
echo app.set^('trust proxy', 1^);
echo.
echo // Rate limiting
echo const limiter = rateLimit^({
echo     windowMs: 15 * 60 * 1000,
echo     max: 100,
echo     message: { success: false, message: 'Muitas requisicoes' }
echo }^);
echo app.use^('/api/', limiter^);
echo.
echo // Body parsing
echo app.use^(compression^(^)^);
echo app.use^(express.json^({ limit: '10mb' }^)^);
echo app.use^(express.urlencoded^({ extended: true, limit: '10mb' }^)^);
echo.
echo // Health check
echo app.get^('/health', ^(req, res^) =^> {
echo     res.json^({ status: 'ok', timestamp: new Date^(^).toISOString^(^) }^);
echo }^);
echo.
echo // Routes
echo app.use^('/api/auth', authRoutes^);
echo app.use^('/api/images', imageRoutes^);
echo app.use^('/api/credits', creditRoutes^);
echo.
echo // Legacy routes
echo app.post^('/api/transform', ^(req, res^) =^> {
echo     res.redirect^(307, '/api/images/generate'^);
echo }^);
echo.
echo app.get^('/api/historico', ^(req, res^) =^> {
echo     res.redirect^(307, '/api/images/generations'^);
echo }^);
echo.
echo // 404
echo app.use^(^(_req, res^) =^> {
echo     res.status^(404^).json^({ success: false, message: 'Rota nao encontrada' }^);
echo }^);
echo.
echo // Error handler
echo app.use^(errorHandler^);
echo.
echo module.exports = app;
) > "%APP_JS%"

echo.
echo ==========================================
echo  BACKEND CORRIGIDO COM SUCESSO!
echo ==========================================
echo.
echo Proximos passos:
echo 1. cd C:\Users\Vinicius\OneDrive\Documentos\sistemasistema\morph
echo 2. git add .
echo 3. git commit -m "fix: corrige app.js do backend"
echo 4. git push
echo.
echo O Koyeb vai fazer deploy automaticamente.
echo.
pause