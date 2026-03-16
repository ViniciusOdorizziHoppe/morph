import express from 'express'
import cors from 'cors'
import multer from 'multer'
import Replicate from 'replicate'
import rateLimit from 'express-rate-limit'
import PQueue from 'p-queue'
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'
import { v2 as cloudinary } from 'cloudinary'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const upload = multer({ dest: 'uploads/' })

app.set('trust proxy', 1)
app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, '../frontend')))

// ─────────────────────────────────────────
// MONGODB
// ─────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB conectado'))
  .catch(err => console.error('❌ MongoDB erro:', err.message))

// ─────────────────────────────────────────
// MODELS
// ─────────────────────────────────────────
const userSchema = new mongoose.Schema({
  nome:     { type: String, required: true },
  email:    { type: String, required: true, unique: true },
  senha:    { type: String, required: true },
  creditos: { type: Number, default: 5 },
  criadoEm: { type: Date, default: Date.now },
})

const geracaoSchema = new mongoose.Schema({
  usuario:      { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  imagemInput:  String,
  imagemOutput: String,
  prompt:       String,
  modelo:       String,
  criadoEm:     { type: Date, default: Date.now },
})

const Usuario = mongoose.model('Usuario', userSchema)
const Geracao = mongoose.model('Geracao', geracaoSchema)

// ─────────────────────────────────────────
// AUTH MIDDLEWARE
// ─────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Token não fornecido' })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.userId = decoded.id
    next()
  } catch {
    return res.status(401).json({ error: 'Token inválido' })
  }
}

// ─────────────────────────────────────────
// AUTH ROUTES
// ─────────────────────────────────────────
app.post('/api/auth/cadastro', async (req, res) => {
  const { nome, email, senha } = req.body
  if (!nome || !email || !senha)
    return res.status(400).json({ error: 'Preencha todos os campos' })
  try {
    const existe = await Usuario.findOne({ email })
    if (existe) return res.status(400).json({ error: 'Email já cadastrado' })
    const hash = await bcrypt.hash(senha, 10)
    const usuario = await Usuario.create({ nome, email, senha: hash })
    const token = jwt.sign({ id: usuario._id }, process.env.JWT_SECRET, { expiresIn: '30d' })
    return res.json({
      token,
      usuario: { id: usuario._id, nome: usuario.nome, email: usuario.email, creditos: usuario.creditos }
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const { email, senha } = req.body
  try {
    const usuario = await Usuario.findOne({ email })
    if (!usuario) return res.status(400).json({ error: 'Email ou senha incorretos' })
    const ok = await bcrypt.compare(senha, usuario.senha)
    if (!ok) return res.status(400).json({ error: 'Email ou senha incorretos' })
    const token = jwt.sign({ id: usuario._id }, process.env.JWT_SECRET, { expiresIn: '30d' })
    return res.json({
      token,
      usuario: { id: usuario._id, nome: usuario.nome, email: usuario.email, creditos: usuario.creditos }
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

app.get('/api/auth/perfil', authMiddleware, async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.userId).select('-senha')
    return res.json(usuario)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

app.get('/api/historico', authMiddleware, async (req, res) => {
  try {
    const geracoes = await Geracao.find({ usuario: req.userId })
      .sort({ criadoEm: -1 })
      .limit(20)
    return res.json(geracoes)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────
// REPLICATE + CLOUDINARY
// ─────────────────────────────────────────
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
})

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const queue = new PQueue({ concurrency: 2 })

const transformLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, error: 'Muitas gerações. Aguarde 1 minuto.' }
})

// Custo em créditos por modo
const CUSTO_CREDITOS = {
  normal: 1,
  instantid: 2,
}

// ─────────────────────────────────────────
// POST /api/transform
// ─────────────────────────────────────────
app.post('/api/transform', transformLimiter, authMiddleware, upload.single('image'), async (req, res) => {
  const { prompt, strength = 0.75, modo = 'normal' } = req.body
  const file = req.file

  if (!file)   return res.status(400).json({ success: false, error: 'Imagem não enviada' })
  if (!prompt) return res.status(400).json({ success: false, error: 'Prompt não informado' })

  const custo = CUSTO_CREDITOS[modo] || 1

  const usuario = await Usuario.findById(req.userId)
  if (!usuario || usuario.creditos < custo)
    return res.status(402).json({ success: false, error: 'Créditos insuficientes' })

  try {
    const resultado = await queue.add(async () => {
      // 1. Upload da imagem original
      const uploadResult = await cloudinary.uploader.upload(file.path, { folder: 'morph/inputs' })
      fs.unlinkSync(file.path)
      const imageUrl = uploadResult.secure_url

      let output

      if (modo === 'instantid') {
        // ── InstantID — preserva o rosto ──
        output = await replicate.run('zsxkib/instant-id', {
          input: {
            image: imageUrl,
            prompt: prompt,
            width: 640,
            height: 640,
            guidance_scale: 5,
            ip_adapter_scale: 0.8,
            num_inference_steps: 30,
            negative_prompt: '(lowres, low quality, worst quality:1.2), watermark, deformed, ugly, disfigured',
            sdxl_weights: 'protovision-xl-high-fidel',
          }
        })
      } else {
        // ── Flux Dev — img2img padrão ──
        output = await replicate.run('black-forest-labs/flux-dev', {
          input: {
            image: imageUrl,
            prompt: prompt,
            strength: parseFloat(strength),
            num_inference_steps: 28,
            guidance: 3.5,
            output_format: 'jpg',
            output_quality: 90,
          }
        })
      }

      const raw = Array.isArray(output) ? output[0] : output
      const generatedUrl = typeof raw === 'string' ? raw : raw.href ?? raw.toString()

      // 2. Salva resultado no Cloudinary
      const savedResult = await cloudinary.uploader.upload(generatedUrl, { folder: 'morph/outputs' })
      return { inputUrl: imageUrl, outputUrl: savedResult.secure_url }
    })

    // Debita créditos e salva histórico
    await Usuario.findByIdAndUpdate(req.userId, { $inc: { creditos: -custo } })
    await Geracao.create({
      usuario: req.userId,
      imagemInput: resultado.inputUrl,
      imagemOutput: resultado.outputUrl,
      prompt,
      modelo: modo,
    })

    return res.json({ success: true, imageUrl: resultado.outputUrl })

  } catch (err) {
    console.error('Erro na transformação:', err.message)
    if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path)
    return res.status(500).json({ success: false, error: err.message || 'Erro ao processar imagem' })
  }
})

// ─────────────────────────────────────────
// CHECKOUT
// ─────────────────────────────────────────
const CREDIT_PLANS = {
  10:  { price: 9.90,  label: '10 créditos MORPH' },
  50:  { price: 34.90, label: '50 créditos MORPH' },
  150: { price: 79.90, label: '150 créditos MORPH' },
}

app.post('/api/checkout', authMiddleware, async (req, res) => {
  const { credits } = req.body
  const plan = CREDIT_PLANS[credits]
  if (!plan) return res.status(400).json({ error: 'Plano inválido' })

  try {
    const preference = new Preference(mpClient)
    const response = await preference.create({
      body: {
        items: [{ title: plan.label, quantity: 1, unit_price: plan.price, currency_id: 'BRL' }],
        back_urls: {
          success: `${process.env.FRONTEND_URL}/success?credits=${credits}`,
          failure: process.env.FRONTEND_URL,
          pending: process.env.FRONTEND_URL,
        },
        auto_return: 'approved',
        notification_url: `${process.env.BACKEND_URL}/api/webhook`,
        metadata: { credits: credits.toString(), userId: req.userId },
      }
    })
    return res.json({ url: response.init_point })
  } catch (err) {
    console.error('Erro Mercado Pago:', err.message)
    return res.status(500).json({ error: 'Erro ao criar checkout' })
  }
})

// ─────────────────────────────────────────
// WEBHOOK
// ─────────────────────────────────────────
app.post('/api/webhook', async (req, res) => {
  const { type, data } = req.body
  if (type === 'payment') {
    try {
      const payment = new Payment(mpClient)
      const paymentData = await payment.get({ id: data.id })
      if (paymentData.status === 'approved') {
        const credits = parseInt(paymentData.metadata?.credits || 0)
        const userId = paymentData.metadata?.userId
        if (userId) {
          await Usuario.findByIdAndUpdate(userId, { $inc: { creditos: credits } })
          console.log(`✅ +${credits} créditos para user ${userId}`)
        }
      }
    } catch (err) {
      console.error('Erro webhook:', err.message)
    }
  }
  res.sendStatus(200)
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`🚀 MORPH rodando em http://localhost:${PORT}`))