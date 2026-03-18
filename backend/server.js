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
import http from "http";

dotenv.config();

const app = express();
app.use(express.json());

// ================= CORS =================
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// ✅ CORREÇÃO AQUI (NÃO USA MAIS "*")
app.options("/*", cors());

// ================= CLOUDINARY =================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ================= DB =================
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log("🟢 MongoDB conectado");
}).catch(err => {
  console.error("🔴 Erro MongoDB:", err);
});

// ================= SCHEMAS =================
const Usuario = mongoose.model("Usuario", new mongoose.Schema({
  nome: String,
  email: { type: String, unique: true },
  senha: String,
  creditos: { type: Number, default: 5 },
  createdAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now },
  referralCode: String,
  referredBy: mongoose.Schema.Types.ObjectId,
  isAdmin: { type: Boolean, default: false }
}));

const Geracao = mongoose.model("Geracao", new mongoose.Schema({
  usuario: mongoose.Schema.Types.ObjectId,
  imagem: String,
  resultado: String,
  prompt: String,
  data: { type: Date, default: Date.now }
}));

// ================= REPLICATE =================
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN
});

// ================= FILA =================
const queue = new PQueue({ concurrency: 1 });

// ================= UPLOAD =================
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ================= AUTH =================
function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ error: "Token ausente" });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
}

// ================= STREAM → BUFFER =================
async function streamToBuffer(stream) {
  const reader = stream.getReader();
  const chunks = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  return Buffer.concat(chunks);
}

// ================= TRANSFORM =================
app.post("/api/transform", auth, upload.single("image"), async (req, res) => {
  console.log("=== TRANSFORM STARTED ===");

  let tempFile = req.file?.path;

  try {
    const user = await Usuario.findOneAndUpdate(
      { _id: req.userId, creditos: { $gte: 1 } },
      { $inc: { creditos: -1 }, lastActive: new Date() },
      { returnDocument: "after" }
    );

    if (!user) {
      if (tempFile) await fs.promises.unlink(tempFile).catch(() => {});
      return res.status(402).json({ error: "Créditos insuficientes" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Nenhuma imagem enviada" });
    }

    const prompt = req.body.prompt?.trim() || "a person";

    console.log("Upload Cloudinary...");

    const cloudResult = await cloudinary.uploader.upload(tempFile, {
      folder: "morph_uploads"
    });

    await fs.promises.unlink(tempFile);
    tempFile = null;

    console.log("Rodando IA (FACE LOCK)...");

    const resultado = await queue.add(async () => {
      return await replicate.run(
        "lucataco/ip-adapter-face-id",
        {
          input: {
            image: cloudResult.secure_url,
            prompt: `${prompt}, ultra realistic, 4k, detailed skin, sharp face, professional photography`,
            face_image: cloudResult.secure_url,
            ip_adapter_scale: 0.8,
            num_inference_steps: 40,
            guidance_scale: 7.5,
            negative_prompt: "blurry, deformed face, ugly, distorted, low quality"
          }
        }
      );
    });

    if (!resultado || !resultado[0]) {
      throw new Error("Modelo não retornou imagem");
    }

    console.log("Convertendo stream...");

    const buffer = await streamToBuffer(resultado[0]);

    console.log("Upload resultado...");

    const uploadFinal = await cloudinary.uploader.upload(
      `data:image/png;base64,${buffer.toString("base64")}`,
      { folder: "morph_results" }
    );

    const finalImageUrl = uploadFinal.secure_url;

    await Geracao.create({
      usuario: req.userId,
      imagem: cloudResult.secure_url,
      resultado: finalImageUrl,
      prompt
    });

    console.log("=== SUCCESS ===");

    res.json({
      success: true,
      imageUrl: finalImageUrl,
      creditos: user.creditos
    });

  } catch (err) {
    console.error("ERRO:", err);

    if (tempFile) {
      await fs.promises.unlink(tempFile).catch(() => {});
    }

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ================= ROOT =================
app.get("/", (req, res) => {
  res.json({
    status: "API ONLINE",
    timestamp: new Date().toISOString()
  });
});

// ================= SERVER =================
const PORT = process.env.PORT || 8000;

const server = http.createServer(app);
server.timeout = 300000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server rodando na porta ${PORT}`);
});