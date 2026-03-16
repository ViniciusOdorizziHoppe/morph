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

// CORS
app.use(cors({
  origin: true,
  credentials: true
}));

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Database
mongoose.connect(process.env.MONGO_URI);

// Schemas
const Usuario = mongoose.model("Usuario", new mongoose.Schema({
  nome: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  senha: { type: String, required: true },
  creditos: { type: Number, default: 5 }
}));

const Geracao = mongoose.model("Geracao", new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  imagem: String,
  resultado: String,
  prompt: String,
  data: { type: Date, default: Date.now }
}));

// Replicate
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN
});

// Fila
const queue = new PQueue({ concurrency: 1 });
const upload = multer({ 
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Auth middleware
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ success: false, error: "Token ausente" });
  
  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    return res.status(401).json({ success: false, error: "Token inválido" });
  }
}

// CADASTRO
app.post("/api/auth/cadastro", async (req, res) => {
  try {
    const { nome, email, senha } = req.body;
    
    if (!nome || !email || !senha) {
      return res.status(400).json({ success: false, error: "Preencha todos os campos" });
    }
    
    if (senha.length < 6) {
      return res.status(400).json({ success: false, error: "Senha deve ter no mínimo 6 caracteres" });
    }
    
    const existe = await Usuario.findOne({ email });
    if (existe) {
      return res.status(400).json({ success: false, error: "Email já cadastrado" });
    }
    
    const hash = await bcrypt.hash(senha, 10);
    const user = await Usuario.create({ 
      nome, 
      email, 
      senha: hash, 
      creditos: 5 
    });
    
    const token = jwt.sign(
      { id: user._id }, 
      process.env.JWT_SECRET, 
      { expiresIn: "7d" }
    );
    
    res.json({
      success: true,
      token,
      usuario: {
        id: user._id,
        nome: user.nome,
        email: user.email,
        creditos: user.creditos
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erro ao criar conta" });
  }
});

// LOGIN
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, senha } = req.body;
    
    if (!email || !senha) {
      return res.status(400).json({ success: false, error: "Preencha email e senha" });
    }
    
    const user = await Usuario.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, error: "Usuário não encontrado" });
    }
    
    const ok = await bcrypt.compare(senha, user.senha);
    if (!ok) {
      return res.status(401).json({ success: false, error: "Senha incorreta" });
    }
    
    const token = jwt.sign(
      { id: user._id }, 
      process.env.JWT_SECRET, 
      { expiresIn: "7d" }
    );
    
    res.json({
      success: true,
      token,
      usuario: {
        id: user._id,
        nome: user.nome,
        email: user.email,
        creditos: user.creditos
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erro ao fazer login" });
  }
});

// TRANSFORMAR IMAGEM - CORRIGIDO
app.post("/api/transform", auth, upload.single("image"), async (req, res) => {
  let tempFile = req.file?.path;
  
  try {
    // Verifica créditos
    const user = await Usuario.findOneAndUpdate(
      { _id: req.userId, creditos: { $gte: 1 } },
      { $inc: { creditos: -1 } },
      { new: true }
    );

    if (!user) {
      if (tempFile) await fs.promises.unlink(tempFile).catch(() => {});
      return res.status(402).json({ 
        success: false, 
        error: "Créditos insuficientes. Compre mais créditos para continuar." 
      });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: "Nenhuma imagem enviada" });
    }

    const prompt = req.body.prompt?.trim() || "realistic portrait";
    const strength = Math.min(Math.max(parseFloat(req.body.strength) || 0.75, 0.1), 1);

    console.log("Fazendo upload para Cloudinary...");
    
    // Upload para Cloudinary
    const cloudResult = await cloudinary.uploader.upload(tempFile, {
      folder: "morph_uploads",
      resource_type: "image"
    });

    console.log("Upload concluído:", cloudResult.secure_url);

    // Remove arquivo temporário
    await fs.promises.unlink(tempFile).catch(() => {});
    tempFile = null;

    // Processamento na fila
    console.log("Enviando para Replicate...");
    
    const resultado = await queue.add(async () => {
      // Usando o modelo correto img2img
      const output = await replicate.run(
        "stability-ai/stable-diffusion-img2img:15a3689ee13b0d2616e98820eca31d4c3abcd36672df6afce5cb6feb1d66087d",
        {
          input: {
            image: cloudResult.secure_url,
            prompt: prompt,
            strength: strength,
            num_outputs: 1,
            scheduler: "K_EULER",
            num_inference_steps: 50,
            guidance_scale: 7.5
          }
        }
      );
      console.log("Replicate output:", output);
      return output;
    });

    if (!resultado || resultado.length === 0) {
      throw new Error("Replicate não retornou resultado");
    }

    const imageUrl = resultado[0];

    // Salva no histórico
    await Geracao.create({
      usuario: req.userId,
      imagem: cloudResult.secure_url,
      resultado: imageUrl,
      prompt
    });

    res.json({
      success: true,
      imageUrl: imageUrl,
      creditos: user.creditos
    });

  } catch (err) {
    console.error("Erro no transform:", err);
    if (tempFile) {
      await fs.promises.unlink(tempFile).catch(() => {});
    }
    res.status(500).json({ 
      success: false, 
      error: err.message || "Erro ao processar imagem. Tente novamente." 
    });
  }
});

// HISTÓRICO
app.get("/api/historico", auth, async (req, res) => {
  try {
    const dados = await Geracao.find({ usuario: req.userId })
      .sort({ data: -1 })
      .limit(20);
    
    res.json(dados.map(g => ({ 
      id: g._id,
      imagemOutput: g.resultado, 
      imagemInput: g.imagem,
      prompt: g.prompt, 
      data: g.data 
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao carregar histórico" });
  }
});

// Health
app.get("/", (req, res) => res.json({ status: "API ONLINE", timestamp: new Date().toISOString() }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: "Erro interno do servidor" });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`🚀 Server rodando na porta ${PORT}`));