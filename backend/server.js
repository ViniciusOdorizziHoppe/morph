import express from "express";
import multer from "multer";
import os from "os";
import fs from "fs";
import dotenv from "dotenv";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Replicate from "replicate";
import PQueue from "p-queue";
import cors from "cors";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

const app = express();
app.use(express.json());

// ================= CORS =================
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// ================= CLOUDINARY =================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ================= DB =================
mongoose.connect(process.env.MONGO_URI);

// ================= SCHEMAS =================
const Usuario = mongoose.model("Usuario", new mongoose.Schema({
  nome: String,
  email: { type: String, unique: true },
  senha: String,
  creditos: { type: Number, default: 5 },

  // 🔥 NOVO: sistema de planos
  plano: { type: String, enum: ['free', 'basic', 'pro', 'ultra'], default: 'free' },

  createdAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now },

  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },

  isAdmin: { type: Boolean, default: false }
}));

const Geracao = mongoose.model("Geracao", new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  imagem: String,
  resultado: String,
  prompt: String,
  modelo: String, // 🔥 NOVO: salva qual IA usou
  data: { type: Date, default: Date.now }
}));

const Transacao = mongoose.model("Transacao", new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  tipo: String,
  quantidade: Number,
  valor: { type: Number, default: 0 },
  status: { type: String, default: 'aprovado' },
  data: { type: Date, default: Date.now }
}));

// ================= REPLICATE =================
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN
});

// ================= FILAS (🔥 MELHORADO) =================
const queueFree = new PQueue({ concurrency: 1 });
const queuePremium = new PQueue({ concurrency: 3 });

// ================= UPLOAD =================
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ================= AUTH =================
function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token ausente" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
}

// ================= HELPERS =================

// 🔥 DEFINE QUAL MODELO USAR
function getModelByPlan(plano) {
  if (plano === "pro" || plano === "ultra") return "flux";
  return "sdxl";
}

// 🔥 DEFINE FILA
function getQueue(plano) {
  return (plano === "pro" || plano === "ultra")
    ? queuePremium
    : queueFree;
}

// ================= AUTH =================
app.post("/api/auth/cadastro", async (req, res) => {
  try {
    const { nome, email, senha } = req.body;

    const hash = await bcrypt.hash(senha, 10);

    const user = await Usuario.create({
      nome,
      email,
      senha: hash,
      creditos: 5
    });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

    res.json({ token, usuario: user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, senha } = req.body;

  const user = await Usuario.findOne({ email });
  if (!user) return res.status(401).json({ error: "Usuário não encontrado" });

  const ok = await bcrypt.compare(senha, user.senha);
  if (!ok) return res.status(401).json({ error: "Senha incorreta" });

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

  res.json({ token, usuario: user });
});

// ================= TRANSFORM =================
app.post("/api/transform", auth, upload.single("image"), async (req, res) => {

  let tempFile = req.file?.path;

  try {
    const user = await Usuario.findOneAndUpdate(
      { _id: req.userId, creditos: { $gte: 1 } },
      { $inc: { creditos: -1 }, lastActive: new Date() },
      { new: true }
    );

    if (!user) return res.status(402).json({ error: "Sem créditos" });
    if (!req.file) return res.status(400).json({ error: "Sem imagem" });

    const prompt = req.body.prompt || "a person";

    // ================= UPLOAD =================
    const cloudResult = await cloudinary.uploader.upload(tempFile, {
      folder: "uploads"
    });

    await fs.promises.unlink(tempFile).catch(() => {});

    // ================= ESCOLHA DE MODELO =================
    const modelType = getModelByPlan(user.plano);
    const queue = getQueue(user.plano);

    let model;
    let input;

    if (modelType === "flux") {
      model = "black-forest-labs/flux-dev";

      input = {
        prompt: `${prompt}, identical face, same person, ultra realistic, high detail skin`,
        image: cloudResult.secure_url,
        num_inference_steps: 30,
        guidance_scale: 3.5
      };

    } else {
      model = "stability-ai/stable-diffusion-img2img:15a3689e...";

      input = {
        image: cloudResult.secure_url,
        prompt: `${prompt}, same face, preserve identity`,
        strength: 0.75,
        num_inference_steps: 40
      };
    }

    // ================= EXECUÇÃO =================
    const resultado = await queue.add(() =>
      replicate.run(model, { input })
    );

    if (!resultado || resultado.length === 0) {
      throw new Error("Sem resultado");
    }

    let finalUrl;

    if (typeof resultado[0] === "string") {
      finalUrl = resultado[0];
    } else {
      const buffer = Buffer.from(await resultado[0].arrayBuffer());

      const upload = await cloudinary.uploader.upload(
        `data:image/png;base64,${buffer.toString("base64")}`,
        { folder: "results" }
      );

      finalUrl = upload.secure_url;
    }

    await Geracao.create({
      usuario: user._id,
      imagem: cloudResult.secure_url,
      resultado: finalUrl,
      prompt,
      modelo: modelType
    });

    res.json({
      success: true,
      imageUrl: finalUrl,
      creditos: user.creditos,
      plano: user.plano,
      modelo: modelType
    });

  } catch (err) {
    if (tempFile) await fs.promises.unlink(tempFile).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

// ================= SERVER =================
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log("🚀 rodando"));