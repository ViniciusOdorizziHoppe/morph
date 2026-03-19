require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const Replicate = require("replicate");
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

/* ================= ADMIN MIDDLEWARE ================= */

const adminMiddleware = async (req, res, next) => {
  try {
    const user = await Usuario.findById(req.userId).select("isAdmin");
    if (!user || !user.isAdmin) return res.status(403).json({ error: "Acesso negado" });
    next();
  } catch {
    res.status(500).json({ error: "Erro ao verificar permissão" });
  }
};



const Usuario = mongoose.model("Usuario", new mongoose.Schema({
  email: String,
  senha: String,
  plano: { type: String, default: "free" },
  creditos: { type: Number, default: 5 },
  isAdmin: { type: Boolean, default: false },
  lastRequest: { type: Date },
  createdAt: { type: Date, default: Date.now }
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

// Semáforo simples — substitui p-queue sem dependência ESM
class Semaphore {
  constructor(concurrency) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  add(fn) {
    return new Promise((resolve, reject) => {
      const run = async () => {
        this.running++;
        try { resolve(await fn()); }
        catch (err) { reject(err); }
        finally {
          this.running--;
          if (this.queue.length > 0) this.queue.shift()();
        }
      };
      if (this.running < this.concurrency) run();
      else this.queue.push(run);
    });
  }
}

const queueFree    = new Semaphore(1);
const queuePremium = new Semaphore(3);

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
      usuario: { id: user._id, nome: user.email.split("@")[0], email: user.email, plano: user.plano, creditos: user.creditos, isAdmin: user.isAdmin || false }
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

/* ================= ADMIN ROTAS ================= */

// Dashboard — stats gerais
app.get("/api/admin/dashboard", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const agora = new Date();
    const inicioHoje = new Date(agora); inicioHoje.setHours(0,0,0,0);
    const inicio7d   = new Date(agora - 7 * 86400000);
    const inicio30d  = new Date(agora - 30 * 86400000);

    const [
      totalUsuarios, usuariosHoje, usuarios7d, usuarios30d,
      totalGeracoes, geracoesHoje, geracoes7d,
      geracoesDone, geracoesError,
      topUsuarios
    ] = await Promise.all([
      Usuario.countDocuments(),
      Usuario.countDocuments({ createdAt: { $gte: inicioHoje } }),
      Usuario.countDocuments({ createdAt: { $gte: inicio7d } }),
      Usuario.countDocuments({ createdAt: { $gte: inicio30d } }),
      Geracao.countDocuments(),
      Geracao.countDocuments({ createdAt: { $gte: inicioHoje } }),
      Geracao.countDocuments({ createdAt: { $gte: inicio7d } }),
      Geracao.countDocuments({ status: "done" }),
      Geracao.countDocuments({ status: "error" }),
      Geracao.aggregate([
        { $match: { status: "done" } },
        { $group: { _id: "$usuario", total: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 10 },
        { $lookup: { from: "usuarios", localField: "_id", foreignField: "_id", as: "user" } },
        { $unwind: "$user" },
        { $project: { email: "$user.email", plano: "$user.plano", creditos: "$user.creditos", total: 1 } }
      ])
    ]);

    // gerações por dia nos últimos 7 dias
    const geracoesPorDia = await Geracao.aggregate([
      { $match: { createdAt: { $gte: inicio7d } } },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        total: { $sum: 1 },
        sucesso: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } }
      }},
      { $sort: { _id: 1 } }
    ]);

    // taxa de sucesso
    const taxaSucesso = totalGeracoes > 0
      ? Math.round((geracoesDone / totalGeracoes) * 100)
      : 0;

    res.json({
      usuarios: { total: totalUsuarios, hoje: usuariosHoje, ultimos7d: usuarios7d, ultimos30d: usuarios30d },
      geracoes: { total: totalGeracoes, hoje: geracoesHoje, ultimos7d: geracoes7d, sucesso: geracoesDone, erro: geracoesError, taxaSucesso },
      geracoesPorDia,
      topUsuarios
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lista todos os usuários com paginação
app.get("/api/admin/usuarios", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const busca = req.query.busca || "";

    const filtro = busca ? { email: { $regex: busca, $options: "i" } } : {};

    const [usuarios, total] = await Promise.all([
      Usuario.find(filtro)
        .select("-senha")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Usuario.countDocuments(filtro)
    ]);

    // adiciona contagem de gerações por usuário
    const ids = usuarios.map(u => u._id);
    const contagens = await Geracao.aggregate([
      { $match: { usuario: { $in: ids }, status: "done" } },
      { $group: { _id: "$usuario", total: { $sum: 1 } } }
    ]);
    const mapaContagens = Object.fromEntries(contagens.map(c => [String(c._id), c.total]));

    const resultado = usuarios.map(u => ({
      ...u.toObject(),
      totalGeracoes: mapaContagens[String(u._id)] || 0
    }));

    res.json({ usuarios: resultado, total, pages: Math.ceil(total / limit), page });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Editar usuário (créditos, plano, isAdmin)
app.patch("/api/admin/usuarios/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { creditos, plano, isAdmin } = req.body;
    const update = {};
    if (creditos !== undefined) update.creditos = Number(creditos);
    if (plano    !== undefined) update.plano    = plano;
    if (isAdmin  !== undefined) update.isAdmin  = isAdmin;

    const user = await Usuario.findByIdAndUpdate(req.params.id, update, { new: true }).select("-senha");
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deletar usuário
app.delete("/api/admin/usuarios/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await Promise.all([
      Usuario.findByIdAndDelete(req.params.id),
      Geracao.deleteMany({ usuario: req.params.id })
    ]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lista gerações recentes com filtro
app.get("/api/admin/geracoes", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const page   = parseInt(req.query.page)   || 1;
    const limit  = parseInt(req.query.limit)  || 20;
    const status = req.query.status || "";

    const filtro = status ? { status } : {};

    const [geracoes, total] = await Promise.all([
      Geracao.find(filtro)
        .populate("usuario", "email plano")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Geracao.countDocuments(filtro)
    ]);

    res.json({ geracoes, total, pages: Math.ceil(total / limit), page });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Promover usuário a admin pelo email (rota de setup inicial)
app.post("/api/admin/promover", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await Usuario.findOneAndUpdate({ email }, { isAdmin: true }, { new: true }).select("-senha");
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Setup: torna o primeiro usuário admin
// Requer ADMIN_SECRET no body — defina a variável de ambiente ADMIN_SECRET no Koyeb
app.post("/api/admin/setup", async (req, res) => {
  try {
    const { email, secret } = req.body;

    // bloqueia se não tiver ADMIN_SECRET configurado ou se a senha estiver errada
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret) return res.status(403).json({ error: "ADMIN_SECRET não configurado no servidor" });
    if (secret !== adminSecret) return res.status(403).json({ error: "Senha secreta incorreta" });

    const jaTemAdmin = await Usuario.findOne({ isAdmin: true });
    if (jaTemAdmin) return res.status(403).json({ error: "Admin já configurado — use /api/admin/promover" });

    const user = await Usuario.findOneAndUpdate({ email }, { isAdmin: true }, { new: true }).select("-senha");
    if (!user) return res.status(404).json({ error: "Usuário não encontrado — cadastre-se primeiro" });
    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= START ================= */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🔥 Server rodando na porta", PORT));