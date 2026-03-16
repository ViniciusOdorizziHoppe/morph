import express from 'express'
import cors from 'cors'
import multer from 'multer'
import Replicate from 'replicate'
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'
import { v2 as cloudinary } from 'cloudinary'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const upload = multer({ dest: 'uploads/' })

app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, '../frontend')))

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
})

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// ─────────────────────────────────────────
// POST /api/transform
// ─────────────────────────────────────────
app.post('/api/transform', upload.single('image'), async (req, res) => {
  const { prompt, strength = 0.75 } = req.body
  const file = req.file

  if (!file) return res.status(400).json({ success: false, error: 'Imagem não enviada' })
  if (!prompt) return res.status(400).json({ success: false, error: 'Prompt não informado' })

  try {
    // 1. Upload da imagem original pro Cloudinary
    const uploadResult = await cloudinary.uploader.upload(file.path, {
      folder: 'morph/inputs',
    })
    fs.unlinkSync(file.path)

    const imageUrl = uploadResult.secure_url

    // 2. Chama o Replicate
    const output = await replicate.run('black-forest-labs/flux-dev', {
      input: {
        image: imageUrl,
        prompt: prompt,
        strength: parseFloat(strength),
        num_inference_steps: 28,
        guidance: 3.5,
        output_format: 'jpg',
        output_quality: 90,
      },
    })

    // 3. Extrai a URL independente do formato retornado
    const raw = Array.isArray(output) ? output[0] : output
    const generatedUrl = typeof raw === 'string' ? raw : raw.href ?? raw.toString()

    // 4. Salva resultado no Cloudinary
    const savedResult = await cloudinary.uploader.upload(generatedUrl, {
      folder: 'morph/outputs',
    })

    return res.json({ success: true, imageUrl: savedResult.secure_url })

  } catch (err) {
    console.error('Erro na transformação:', err.message)
    if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path)
    return res.status(500).json({ success: false, error: err.message || 'Erro ao processar imagem' })
  }
})

// ─────────────────────────────────────────
// POST /api/checkout
// ─────────────────────────────────────────
const CREDIT_PLANS = {
  10:  { price: 9.90,  label: '10 créditos MORPH' },
  50:  { price: 34.90, label: '50 créditos MORPH' },
  150: { price: 79.90, label: '150 créditos MORPH' },
}

app.post('/api/checkout', async (req, res) => {
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
        metadata: { credits: credits.toString() },
      }
    })
    return res.json({ url: response.init_point })
  } catch (err) {
    console.error('Erro Mercado Pago:', err.message)
    return res.status(500).json({ error: 'Erro ao criar checkout' })
  }
})

// ─────────────────────────────────────────
// POST /api/webhook
// ─────────────────────────────────────────
app.post('/api/webhook', async (req, res) => {
  const { type, data } = req.body
  if (type === 'payment') {
    try {
      const payment = new Payment(mpClient)
      const paymentData = await payment.get({ id: data.id })
      if (paymentData.status === 'approved') {
        const credits = parseInt(paymentData.metadata?.credits || 0)
        console.log(`✅ Pagamento aprovado: +${credits} créditos`)
      }
    } catch (err) {
      console.error('Erro webhook:', err.message)
    }
  }
  res.sendStatus(200)
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`🚀 MORPH rodando em http://localhost:${PORT}`))