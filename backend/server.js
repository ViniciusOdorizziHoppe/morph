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

// Função para converter stream para buffer
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Função para fazer upload de buffer para Cloudinary
async function uploadBufferToCloudinary(buffer, folder) {
  return new Promise(async (resolve, reject) => {
    const { Readable } = await import('stream');
    const readableStream = Readable.from([buffer]);
    
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: "image"
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    
    readableStream.pipe(uploadStream);
  });
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

// TRANSFORMAR IMAGEM - IP-ADAPTER FACE ID (MANTÉM O ROSTO)
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

    const prompt = req.body.prompt?.trim() || "a person";
    // IP-Adapter usa scale (0-1) em vez de strength
    const scale = Math.min(Math.max(parseFloat(req.body.strength) || 0.75, 0.1), 1.0);

    console.log("Fazendo upload para Cloudinary...");
    
    // Upload da imagem original para Cloudinary
    const cloudResult = await cloudinary.uploader.upload(tempFile, {
      folder: "morph_uploads",
      resource_type: "image"
    });

    console.log("Upload concluído:", cloudResult.secure_url);

    // Remove arquivo temporário
    await fs.promises.unlink(tempFile).catch(() => {});
    tempFile = null;

    // Processamento na fila usando IP-Adapter Face ID
    console.log("Enviando para IP-Adapter Face ID... Prompt:", prompt, "Scale:", scale);
    
    const resultado = await queue.add(async () => {
      // IP-Adapter Face ID - mantém o rosto perfeitamente
      const output = await replicate.run(
        "tencentarc/ip-adapter-faceid:eb8d9ab9e001d6ebf74b6e10d5e9c6b8f2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e",
        {
          input: {
            image: cloudResult.secure_url,
            prompt: prompt,
            negative_prompt: "blurry, low quality, distorted face, ugly, deformed, extra limbs, bad anatomy",
            scale: scale,
            width: 512,
            height: 512,
            num_inference_steps: 30,
            guidance_scale: 7.5,
            seed: -1
          }
        }
      );
      
      console.log("IP-Adapter output:", output);
      return output;
    });

    if (!resultado || resultado.length === 0) {
      throw new Error("IP-Adapter não retornou resultado");
    }

    // Processa o resultado
    let finalImageUrl;
    
    if (typeof resultado[0] === 'string') {
      // Se for string (URL), usa diretamente
      finalImageUrl = resultado[0];
      console.log("Resultado é URL:", finalImageUrl);
    } else {
      // Se for stream, converte e faz upload
      console.log("Resultado é stream, convertendo...");
      const stream = resultado[0];
      const buffer = await streamToBuffer(stream);
      
      const uploadResult = await uploadBufferToCloudinary(buffer, "morph_results");
      finalImageUrl = uploadResult.secure_url;
    }

    console.log("URL final:", finalImageUrl);

    // Salva no histórico
    await Geracao.create({
      usuario: req.userId,
      imagem: cloudResult.secure_url,
      resultado: finalImageUrl,
      prompt
    });

    res.json({
      success: true,
      imageUrl: finalImageUrl,
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