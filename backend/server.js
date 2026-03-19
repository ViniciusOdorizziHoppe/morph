require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const Replicate = require("replicate");
const PQueue = require("p-queue").default;
const cloudinary = require("cloudinary").v2;
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
app.use(cors({
  origin: ["https://morph-one-tan.vercel.app"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

/* ================= CONFIG ================= */

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN
});

mongoose.connect(process.env.MONGO_URI);

/* ================= AUTH MIDDLEWARE ================= */

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Token não fornecido" });
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return res.status(401).json({ error: "Token mal formatado" });
  try {
    const decoded = jwt.verify(parts[1], process.env.JWT_SECRET || "morph_secret_key");
    req.userId = decoded.id;
    return next();
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
};

/* ================= MODELS ================= */

const Usuario = mongoose.model("Usuario", new mongoose.Schema({
  email: String,
  senha: String,
  plano: { type: String, default: "free" },
  creditos: { type: Number, default: 5 },
  lastRequest: { type: Date }
}));

const Geracao = mongoose.model("Geracao", new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
  imagem: String,
  prompt: String,
  resultado: String,
  erro: { type: String, default: null },
  status: {
    type: String,
    enum: ["pending", "processing", "done", "error"],
    default: "pending"
  },
  tentativas: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
}));

/* ================= FILAS ================= */

const queueFree = new PQueue({ concurrency: 1 });
const queuePremium = new PQueue({ concurrency: 3 });

function getQueue(plano) {
  return plano === "premium" ? queuePremium : queueFree;
}

/* ================= SEGURANÇA ================= */

async function antiSpam(user) {
  const now = Date.now();
  if (user.lastRequest) {
    const diff = now - new Date(user.lastRequest).getTime();
    if (diff < 5000) throw new Error("Espere 5 segundos entre requisições");
  }
  user.lastRequest = new Date();
  await user.save();
}

/* ================= UPLOAD ================= */

// memoryStorage: arquivo fica em req.file.buffer (sem escrever no disco)
// necessário em containers como Koyeb onde não há diretório uploads/ persistente
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Apenas imagens são permitidas."));
  }
});

/* ================= CORE PROCESS ================= */

// timeout para o Replicate não travar infinitamente
function comTimeout(promise, ms, mensagem) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(mensagem)), ms))
  ]);
}

async function processImage(jobId) {
  try {
    const job = await Geracao.findById(jobId).populate("usuario");
    if (!job) return;
    const user = job.usuario;

    job.status = "processing";
    await job.save();

    if (user.creditos <= 0) {
      job.status = "error";
      job.erro = "Créditos insuficientes";
      await job.save();
      return;
    }

    const queue = getQueue(user.plano);

    // captura erro dentro da queue e repassa pro try/catch externo
    const erroQueue = await queue.add(async () => {
      try {
        let model, input;

        if (user.plano === "premium") {
          model = "black-forest-labs/flux-dev";
          input = { prompt: `${job.prompt}, ultra realistic, 8k`, image: job.imagem };
        } else {
          model = "stability-ai/stable-diffusion-img2img:15a3689ee13b0d2616e98820eca31d4c3abcd36672df6afce5cb6feb1d66087d";
          input = { image: job.imagem, prompt: job.prompt, strength: 0.75 };
        }

        console.log("🚀 PROCESSANDO:", job._id);

        let output;
        try {
          // timeout de 90 segundos — evita travar indefinidamente
          output = await comTimeout(
            replicate.run(model, { input }),
            90000,
            "Replicate timeout após 90s"
          );
        } catch (err) {
          console.log("⚠️ ERRO IA:", err.message);
          if (job.tentativas < 2) {
            job.tentativas++;
            await job.save();
            // reagenda fora da queue para não bloquear
            setTimeout(() => processImage(jobId), 2000);
            return null;
          } else {
            throw err;
          }
        }

        if (!output || output.length === 0) throw new Error("Replicate retornou vazio — tente um prompt diferente");

        let finalUrl;
        if (typeof output[0] === "string") {
          finalUrl = output[0];
        } else {
          const chunks = [];
          for await (const chunk of output[0]) chunks.push(chunk);
          const buffer = Buffer.concat(chunks);
          const up = await cloudinary.uploader.upload(`data:image/png;base64,${buffer.toString("base64")}`);
          finalUrl = up.secure_url;
        }

        await Usuario.findByIdAndUpdate(user._id, { $inc: { creditos: -1 } });

        job.resultado = finalUrl;
        job.status = "done";
        await job.save();

        console.log("✅ FINALIZADO:", job._id);
        return null;

      } catch (err) {
        return err; // repassa o erro pro escopo externo
      }
    });

    // se a queue retornou um erro, trata aqui
    if (erroQueue instanceof Error) throw erroQueue;

  } catch (err) {
    console.error("🔥 ERRO FINAL:", err.message);
    await Geracao.findByIdAndUpdate(jobId, {
      status: "error",
      erro: err.message
    });
  }
}

/* ================= ROTAS ================= */

// DEBUG — testa MongoDB, Cloudinary e variáveis de ambiente
app.get("/api/debug", async (req, res) => {
  const resultado = {
    env: {
      MONGO_URI:          !!process.env.MONGO_URI,
      CLOUDINARY_NAME:    !!process.env.CLOUDINARY_NAME,
      CLOUDINARY_KEY:     !!process.env.CLOUDINARY_KEY,
      CLOUDINARY_SECRET:  !!process.env.CLOUDINARY_SECRET,
      REPLICATE_API_TOKEN: !!process.env.REPLICATE_API_TOKEN,
      JWT_SECRET:         !!process.env.JWT_SECRET,
    },
    mongodb: "não testado",
    cloudinary: "não testado"
  };

  try {
    await mongoose.connection.db.admin().ping();
    resultado.mongodb = "✅ conectado";
  } catch (err) {
    resultado.mongodb = `❌ ${err.message}`;
  }

  try {
    await cloudinary.api.ping();
    resultado.cloudinary = "✅ conectado";
  } catch (err) {
    resultado.cloudinary = `❌ ${err.message}`;
  }

  res.json(resultado);
});

// AUTH - LOGIN
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ error: "Email e senha são obrigatórios" });
    const user = await Usuario.findOne({ email });
    if (!user) return res.status(401).json({ error: "Credenciais inválidas" });
    const isMatch = await bcrypt.compare(senha, user.senha);
    if (!isMatch) return res.status(401).json({ error: "Credenciais inválidas" });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || "morph_secret_key", { expiresIn: "7d" });
    res.json({
      token,
      usuario: { id: user._id, nome: user.email.split("@")[0], email: user.email, plano: user.plano, creditos: user.creditos }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AUTH - CADASTRO
app.post("/api/auth/cadastro", async (req, res) => {
  try {
    const { nome, email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ error: "Email e senha são obrigatórios" });
    const existingUser = await Usuario.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "Email já cadastrado" });
    const hashedSenha = await bcrypt.hash(senha, 10);
    const user = await Usuario.create({ email, senha: hashedSenha, plano: "free", creditos: 5 });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || "morph_secret_key", { expiresIn: "7d" });
    res.json({
      token,
      usuario: { id: user._id, nome: nome || email.split("@")[0], email: user.email, plano: user.plano, creditos: user.creditos }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// TRANSFORM
app.post("/api/transform", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    const user = await Usuario.findById(req.userId);
    if (!user) return res.status(401).json({ error: "Não autorizado" });

    await antiSpam(user);

    if (!req.file) return res.status(400).json({ error: "Sem imagem" });

    // upload direto do buffer para o Cloudinary (sem arquivo em disco)
    let uploadResult;
    try {
      uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "morph/uploads", resource_type: "image" },
          (err, result) => err ? reject(err) : resolve(result)
        );
        stream.end(req.file.buffer);
      });
    } catch (err) {
      return res.status(500).json({ error: `Cloudinary upload falhou: ${err.message}` });
    }

    let job;
    try {
      job = await Geracao.create({
        usuario: user._id,
        imagem: uploadResult.secure_url,
        prompt: req.body.prompt || "a person",
        status: "pending"
      });
    } catch (err) {
      return res.status(500).json({ error: `MongoDB create falhou: ${err.message}` });
    }

    processImage(job._id);

    res.json({ success: true, jobId: job._id });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STATUS — retorna resultado + créditos atualizados quando done
app.get("/api/status/:id", authMiddleware, async (req, res) => {
  try {
    const job = await Geracao.findById(req.params.id);
    if (!job) return res.status(404).json({ error: "Job não encontrado" });

    const response = { status: job.status, imageUrl: job.resultado || null };

    if (job.status === "done" || job.status === "error") {
      const user = await Usuario.findById(req.userId).select("creditos");
      if (user) response.creditos = user.creditos;
      if (job.status === "error") response.erro = job.erro || "Erro ao processar imagem";
    }

    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// HISTÓRICO — campo correto é 'resultado'
app.get("/api/historico", authMiddleware, async (req, res) => {
  try {
    const historico = await Geracao.find({ usuario: req.userId, status: "done" })
      .sort({ createdAt: -1 })
      .limit(20)
      .select("resultado prompt createdAt");
    res.json(historico);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= START ================= */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🔥 Server rodando na porta", PORT));