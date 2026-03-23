<div align="center">

<br/>

```
███╗   ███╗ ██████╗ ██████╗ ██████╗ ██╗  ██╗
████╗ ████║██╔═══██╗██╔══██╗██╔══██╗██║  ██║
██╔████╔██║██║   ██║██████╔╝██████╔╝███████║
██║╚██╔╝██║██║   ██║██╔══██╗██╔═══╝ ██╔══██║
██║ ╚═╝ ██║╚██████╔╝██║  ██║██║     ██║  ██║
╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝
```

**Plataforma de transformação de imagens com Inteligência Artificial**

[![Status](https://img.shields.io/badge/status-live-brightgreen?style=flat-square)](https://morph-one-tan.vercel.app)
[![Frontend](https://img.shields.io/badge/frontend-Vercel-black?style=flat-square&logo=vercel)](https://morph-one-tan.vercel.app)
[![Backend](https://img.shields.io/badge/backend-Koyeb-purple?style=flat-square)](https://realistic-viper-morph-82184336.koyeb.app)
[![Node](https://img.shields.io/badge/node-v24-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

<br/>

[🚀 Demo ao vivo](https://morph-one-tan.vercel.app) · [📖 Documentação](#documentação) · [🐛 Reportar bug](https://github.com/ViniciusOdorizziHoppe/morph/issues)

<br/>

![MORPH Banner](https://res.cloudinary.com/df9b2qd9x/image/upload/v1/morph_uploads/banner_placeholder)

</div>

---

## ✨ O que é o MORPH?

MORPH é um SaaS de transformação de imagens com IA. Você envia uma foto, descreve como quer que ela fique, e o modelo de IA gera uma versão transformada em segundos.

Powered by **FLUX Kontext Pro** da Black Forest Labs — um dos modelos de edição de imagem mais avançados disponíveis atualmente.

```
📤 Envie uma imagem  →  ✍️ Descreva a transformação  →  ✨ Receba o resultado
```

---

## 🎯 Funcionalidades

| Feature | Status |
|---------|--------|
| 🔐 Autenticação com JWT | ✅ |
| 🖼️ Upload e transformação de imagens | ✅ |
| ⚡ Sistema de créditos | ✅ |
| 📊 Histórico de gerações | ✅ |
| 🎨 Estilos rápidos (Anime, Profissional, Artístico...) | ✅ |
| 🔄 Processamento assíncrono com fila | ✅ |
| ☁️ Armazenamento de imagens no Cloudinary | ✅ |
| 💳 Pagamento via Pix (Mercado Pago) | 🚧 Em breve |
| 🎭 InstantID (troca de rosto) | 🚧 Em breve |
| 🎬 Geração de vídeos | 🔮 Roadmap |

---

## 🛠️ Stack Tecnológica

### Frontend
```
HTML5 + CSS3 + JavaScript Vanilla
└── Deploy: Vercel
└── Storage: Cloudinary (imagens)
```

### Backend
```
Node.js + Express.js
├── Autenticação: JWT + bcryptjs
├── Banco de dados: MongoDB Atlas (Mongoose)
├── Upload: Multer (memoryStorage)
├── Fila: Bull (com fallback síncrono sem Redis)
├── Rate limiting: express-rate-limit
└── Deploy: Koyeb
```

### Integrações de IA
```
Replicate API
└── Modelo primário:  black-forest-labs/flux-kontext-pro
└── Modelo fallback:  black-forest-labs/flux-kontext-max
```

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────┐
│                     USUÁRIO                         │
└─────────────────────┬───────────────────────────────┘
                      │ HTTPS
┌─────────────────────▼───────────────────────────────┐
│              FRONTEND (Vercel)                      │
│   index.html  │  js/api.js  │  js/app.js            │
└─────────────────────┬───────────────────────────────┘
                      │ REST API
┌─────────────────────▼───────────────────────────────┐
│              BACKEND (Koyeb :8000)                  │
│                                                     │
│  /api/auth      → authRoutes.js                     │
│  /api/images    → imageRoutes.js                    │
│  /api/credits   → creditRoutes.js                   │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐                 │
│  │  MongoDB    │  │  Bull Queue  │                 │
│  │  (Atlas)    │  │  (ou sync)   │                 │
│  └─────────────┘  └──────┬───────┘                 │
└─────────────────────────┼───────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   ┌──────────┐    ┌─────────────┐   ┌──────────────┐
   │Cloudinary│    │  Replicate  │   │   MongoDB    │
   │ (imagens)│    │ (flux-kontext│   │   (Atlas)    │
   └──────────┘    └─────────────┘   └──────────────┘
```

---

## 🚀 Como rodar localmente

### Pré-requisitos
- Node.js 18+
- Conta no [MongoDB Atlas](https://cloud.mongodb.com)
- Conta no [Cloudinary](https://cloudinary.com)
- Conta no [Replicate](https://replicate.com)

### 1. Clone o repositório

```bash
git clone https://github.com/ViniciusOdorizziHoppe/morph.git
cd morph
```

### 2. Configure o backend

```bash
cd backend
cp .env.example .env
```

Edite o `.env` com suas credenciais:

```env
PORT=8000
NODE_ENV=development

MONGO_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/morph
JWT_SECRET=sua_chave_jwt_super_secreta_64_caracteres_aqui

REPLICATE_API_TOKEN=r8_seu_token_aqui

CLOUDINARY_CLOUD_NAME=seu_cloud
CLOUDINARY_API_KEY=sua_key
CLOUDINARY_API_SECRET=seu_secret

FREE_CREDITS_ON_REGISTER=3
FRONTEND_URL=http://localhost:5500
BACKEND_URL=http://localhost:8000
```

### 3. Instale as dependências e rode

```bash
# Backend
cd backend
npm install
npm start

# Frontend (em outro terminal)
# Abra frontend/index.html com Live Server no VS Code
# ou: cd frontend && npx serve .
```

---

## 📁 Estrutura do projeto

```
morph/
├── backend/
│   ├── config/
│   │   ├── cloudinary.js       # Configuração Cloudinary
│   │   ├── database.js         # Conexão MongoDB
│   │   └── replicate.js        # Modelos e configuração Replicate
│   ├── controllers/
│   │   ├── imageController.js  # Upload + geração de imagens
│   │   ├── creditController.js # Saldo de créditos
│   │   └── userController.js   # Perfil do usuário
│   ├── jobs/
│   │   └── imageGenerationJob.js # Worker de geração
│   ├── middleware/
│   │   ├── auth.js             # Verificação JWT
│   │   ├── upload.js           # Multer (memoryStorage)
│   │   ├── errorHandler.js     # Tratamento global de erros
│   │   └── validateRequest.js  # Validação de requisições
│   ├── models/
│   │   ├── User.js             # Schema usuário + bcrypt
│   │   ├── Generation.js       # Schema geração de imagem
│   │   └── CreditTransaction.js# Schema transações de crédito
│   ├── routes/
│   │   ├── authRoutes.js       # /register, /login, /me
│   │   ├── imageRoutes.js      # /generate, /generations
│   │   └── creditRoutes.js     # /balance
│   ├── services/
│   │   ├── imageGenerationService.js # Lógica Replicate
│   │   ├── cloudinaryService.js      # Upload/delete imagens
│   │   ├── creditService.js          # Transações de crédito
│   │   └── queueService.js           # Bull queue + fallback sync
│   ├── utils/
│   │   ├── promptBuilder.js    # Construção e enhancement de prompts
│   │   ├── validators.js       # Validações de input
│   │   └── logger.js           # Winston logger
│   ├── server.js               # Entry point
│   ├── app.js                  # Express app + middlewares
│   └── package.json
│
└── frontend/
    ├── index.html              # App principal (SPA)
    ├── css/
    │   └── style.css           # Estilos globais
    └── js/
        ├── api.js              # Cliente HTTP (ApiClient class)
        └── app.js              # Lógica da aplicação
```

---

## 🔌 API Reference

### Autenticação

```http
POST /api/auth/register
Content-Type: application/json

{ "name": "João", "email": "joao@email.com", "password": "123456" }
```

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "joao@email.com", "password": "123456" }
```

```http
GET /api/auth/me
Authorization: Bearer <token>
```

### Geração de imagem

```http
POST /api/images/generate
Authorization: Bearer <token>
Content-Type: multipart/form-data

image: <arquivo>
prompt: "transforme em anime"
strength: 0.75
style: "anime"
aspectRatio: "1:1"
```

```http
GET /api/images/generations/:id
Authorization: Bearer <token>
```

### Créditos

```http
GET /api/credits/balance
Authorization: Bearer <token>
```

---

## 💰 Sistema de créditos

| Ação | Créditos |
|------|----------|
| Cadastro | +3 grátis |
| Geração com Flux Kontext Pro | -1 |
| Falha na geração | reembolso automático |

---

## 🔐 Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `MONGO_URI` | ✅ | URI de conexão MongoDB Atlas |
| `JWT_SECRET` | ✅ | Chave secreta JWT (mín. 64 chars) |
| `REPLICATE_API_TOKEN` | ✅ | Token da API Replicate |
| `CLOUDINARY_CLOUD_NAME` | ✅ | Nome do cloud Cloudinary |
| `CLOUDINARY_API_KEY` | ✅ | API Key Cloudinary |
| `CLOUDINARY_API_SECRET` | ✅ | API Secret Cloudinary |
| `PORT` | ❌ | Porta do servidor (padrão: 8000) |
| `FREE_CREDITS_ON_REGISTER` | ❌ | Créditos grátis no cadastro (padrão: 3) |
| `REDIS_HOST` | ❌ | Host Redis para fila (sem Redis = modo síncrono) |
| `MP_ACCESS_TOKEN` | ❌ | Token Mercado Pago (pagamentos) |

---

## 🗺️ Roadmap

- [x] MVP — upload + geração + créditos
- [x] Sistema de fila com fallback síncrono
- [x] Integração flux-kontext-pro
- [ ] Pagamento via Pix (Mercado Pago)
- [ ] InstantID — colocar rosto em qualquer imagem
- [ ] Histórico de gerações aprimorado
- [ ] Geração de vídeos
- [ ] App mobile (PWA)

---

## 👤 Autor

**Vinícius Odorizzi Hoppe**

Estudante de Técnico em Informática no IFC — Instituto Federal Catarinense.
Desenvolvedor back-end focado em Node.js, MongoDB e integração com APIs de IA.

[![GitHub](https://img.shields.io/badge/GitHub-ViniciusOdorizziHoppe-181717?style=flat-square&logo=github)](https://github.com/ViniciusOdorizziHoppe)

---

<div align="center">

Feito com ☕ e muita depuração de logs do Koyeb

</div>
