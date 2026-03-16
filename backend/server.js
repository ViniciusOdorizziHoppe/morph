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

// ============== SCHEMAS ==============

const Usuario = mongoose.model("Usuario", new mongoose.Schema({
  nome: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  senha: { type: String, required: true },
  creditos: { type: Number, default: 5 },
  createdAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now },
  ip: String,
  userAgent: String,
  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  isAdmin: { type: Boolean, default: false }
}));

const Geracao = mongoose.model("Geracao", new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  imagem: String,
  resultado: String,
  prompt: String,
  custo: { type: Number, default: 1 },
  data: { type: Date, default: Date.now }
}));

const Transacao = mongoose.model("Transacao", new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  tipo: { type: String, enum: ['compra', 'uso', 'bonus', 'referral'] },
  quantidade: Number,
  valor: { type: Number, default: 0 },
  status: { type: String, enum: ['pendente', 'aprovado', 'recusado'], default: 'aprovado' },
  data: { type: Date, default: Date.now }
}));

const Visitante = mongoose.model("Visitante", new mongoose.Schema({
  ip: String,
  userAgent: String,
  path: String,
  referrer: String,
  data: { type: Date, default: Date.now }
}));

// ============== CONFIG ==============

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN
});

const queue = new PQueue({ concurrency: 1 });
const upload = multer({ 
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ============== MIDDLEWARES ==============

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

async function adminOnly(req, res, next) {
  try {
    const user = await Usuario.findById(req.userId);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ success: false, error: "Acesso negado" });
    }
    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: "Erro ao verificar admin" });
  }
}

// ============== AUTH ROUTES ==============

app.post("/api/auth/cadastro", async (req, res) => {
  try {
    const { nome, email, senha, referralCode } = req.body;
    
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
    
    // Gera código de referral único
    const userReferralCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    
    let bonusCredits = 5;
    let referredBy = null;
    
    // Verifica código de referral
    if (referralCode) {
      const referrer = await Usuario.findOne({ referralCode: referralCode.toUpperCase() });
      if (referrer) {
        referredBy = referrer._id;
        bonusCredits = 10; // Bônus para quem foi indicado
        
        // Adiciona créditos ao indicador
        await Usuario.findByIdAndUpdate(referrer._id, { $inc: { creditos: 5 } });
        await Transacao.create({
          usuario: referrer._id,
          tipo: 'referral',
          quantidade: 5,
          status: 'aprovado'
        });
      }
    }
    
    const hash = await bcrypt.hash(senha, 10);
    const user = await Usuario.create({ 
      nome, 
      email, 
      senha: hash, 
      creditos: bonusCredits,
      referralCode: userReferralCode,
      referredBy,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    await Transacao.create({
      usuario: user._id,
      tipo: 'bonus',
      quantidade: bonusCredits,
      status: 'aprovado'
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
        creditos: user.creditos,
        referralCode: user.referralCode
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erro ao criar conta" });
  }
});

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
    
    // Atualiza última atividade
    await Usuario.findByIdAndUpdate(user._id, { lastActive: new Date() });
    
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
        creditos: user.creditos,
        referralCode: user.referralCode,
        isAdmin: user.isAdmin
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erro ao fazer login" });
  }
});

// ============== TEMP: ADD 100 CREDITS ==============

// Endpoint temporário para adicionar 100 créditos
app.post("/api/add-100-credits", auth, async (req, res) => {
  try {
    const user = await Usuario.findByIdAndUpdate(
      req.userId,
      { $inc: { creditos: 100 } },
      { new: true }
    );
    
    await Transacao.create({
      usuario: user._id,
      tipo: 'bonus',
      quantidade: 100,
      status: 'aprovado'
    });
    
    res.json({ 
      success: true, 
      message: "100 créditos adicionados!",
      creditos: user.creditos 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============== ADMIN ROUTES ==============

// Dashboard admin completo
app.get("/api/admin/dashboard", auth, adminOnly, async (req, res) => {
  try {
    const agora = new Date();
    const inicioDoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const inicioDoMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const cincoMinutosAtras = new Date(agora - 5 * 60 * 1000);
    
    // Estatísticas gerais
    const [
      totalUsuarios,
      usuariosHoje,
      usuariosMes,
      usuariosAtivos,
      totalGeracoes,
      geracoesHoje,
      totalTransacoes,
      receitaTotal,
      receitaHoje,
      receitaMes
    ] = await Promise.all([
      Usuario.countDocuments(),
      Usuario.countDocuments({ createdAt: { $gte: inicioDoDia } }),
      Usuario.countDocuments({ createdAt: { $gte: inicioDoMes } }),
      Usuario.countDocuments({ lastActive: { $gte: cincoMinutosAtras } }),
      Geracao.countDocuments(),
      Geracao.countDocuments({ data: { $gte: inicioDoDia } }),
      Transacao.countDocuments({ tipo: 'compra', status: 'aprovado' }),
      Transacao.aggregate([{ $match: { tipo: 'compra', status: 'aprovado' } }, { $group: { _id: null, total: { $sum: "$valor" } } }]),
      Transacao.aggregate([{ $match: { tipo: 'compra', status: 'aprovado', data: { $gte: inicioDoDia } } }, { $group: { _id: null, total: { $sum: "$valor" } } }]),
      Transacao.aggregate([{ $match: { tipo: 'compra', status: 'aprovado', data: { $gte: inicioDoMes } } }, { $group: { _id: null, total: { $sum: "$valor" } } }])
    ]);
    
    // Top usuários por gerações
    const topUsuarios = await Geracao.aggregate([
      { $group: { _id: "$usuario", totalGeracoes: { $sum: 1 } } },
      { $sort: { totalGeracoes: -1 } },
      { $limit: 10 },
      { $lookup: { from: "usuarios", localField: "_id", foreignField: "_id", as: "usuario" } },
      { $unwind: "$usuario" },
      { $project: { nome: "$usuario.nome", email: "$usuario.email", totalGeracoes: 1 } }
    ]);
    
    // Gerações por dia (últimos 7 dias)
    const geracoesPorDia = await Geracao.aggregate([
      { 
        $match: { 
          data: { $gte: new Date(agora - 7 * 24 * 60 * 60 * 1000) } 
        } 
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$data" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Taxa de conversão (visitantes / cadastros)
    const visitantesTotais = await Visitante.countDocuments();
    const taxaConversao = visitantesTotais > 0 ? ((totalUsuarios / visitantesTotais) * 100).toFixed(2) : 0;
    
    res.json({
      success: true,
      estatisticas: {
        usuarios: {
          total: totalUsuarios,
          hoje: usuariosHoje,
          esteMes: usuariosMes,
          ativosAgora: usuariosAtivos
        },
        geracoes: {
          total: totalGeracoes,
          hoje: geracoesHoje,
          porDia: geracoesPorDia
        },
        financeiro: {
          receitaTotal: receitaTotal[0]?.total || 0,
          receitaHoje: receitaHoje[0]?.total || 0,
          receitaMes: receitaMes[0]?.total || 0,
          totalTransacoes
        },
        conversao: {
          visitantes: visitantesTotais,
          taxaConversao: `${taxaConversao}%`
        },
        topUsuarios
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Listar todos os usuários
app.get("/api/admin/usuarios", auth, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '' } = req.query;
    const skip = (page - 1) * limit;
    
    const query = search ? {
      $or: [
        { nome: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ]
    } : {};
    
    const [usuarios, total] = await Promise.all([
      Usuario.find(query)
        .select('-senha')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Usuario.countDocuments(query)
    ]);
    
    // Adiciona contagem de gerações para cada usuário
    const usuariosComStats = await Promise.all(
      usuarios.map(async (u) => {
        const geracoes = await Geracao.countDocuments({ usuario: u._id });
        return { ...u.toObject(), totalGeracoes: geracoes };
      })
    );
    
    res.json({
      success: true,
      usuarios: usuariosComStats,
      total,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Editar créditos de usuário
app.post("/api/admin/usuarios/:id/creditos", auth, adminOnly, async (req, res) => {
  try {
    const { quantidade, motivo = 'Ajuste manual' } = req.body;
    
    const user = await Usuario.findByIdAndUpdate(
      req.params.id,
      { $inc: { creditos: quantidade } },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ success: false, error: "Usuário não encontrado" });
    }
    
    await Transacao.create({
      usuario: user._id,
      tipo: quantidade > 0 ? 'bonus' : 'uso',
      quantidade: Math.abs(quantidade),
      status: 'aprovado'
    });
    
    res.json({ success: true, usuario: user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Tornar usuário admin
app.post("/api/admin/usuarios/:id/tornar-admin", auth, adminOnly, async (req, res) => {
  try {
    const user = await Usuario.findByIdAndUpdate(
      req.params.id,
      { isAdmin: true },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ success: false, error: "Usuário não encontrado" });
    }
    
    res.json({ success: true, message: "Usuário agora é admin" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============== GROWTH HACKING - AQUISIÇÃO DE USUÁRIOS ==============

// 1. Sistema de Referral
app.get("/api/referral/stats", auth, async (req, res) => {
  try {
    const [indicados, ganhos] = await Promise.all([
      Usuario.countDocuments({ referredBy: req.userId }),
      Transacao.aggregate([
        { $match: { usuario: req.userId, tipo: 'referral' } },
        { $group: { _id: null, total: { $sum: "$quantidade" } } }
      ])
    ]);
    
    res.json({
      success: true,
      codigo: (await Usuario.findById(req.userId)).referralCode,
      indicados,
      ganhos: ganhos[0]?.total || 0,
      link: `https://morph-one-tan.vercel.app?ref=${(await Usuario.findById(req.userId)).referralCode}`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Track de visitantes
app.post("/api/track/visit", async (req, res) => {
  try {
    const { path, referrer } = req.body;
    
    await Visitante.create({
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      path,
      referrer
    });
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Estratégias de crescimento (endpoints para o admin)
app.get("/api/admin/growth-strategies", auth, adminOnly, async (req, res) => {
  try {
    const agora = new Date();
    const trintaDiasAtras = new Date(agora - 30 * 24 * 60 * 60 * 1000);
    
    // Análise de canais de aquisição
    const canais = await Visitante.aggregate([
      { $match: { data: { $gte: trintaDiasAtras } } },
      {
        $group: {
          _id: {
            $cond: [
              { $regexMatch: { input: "$referrer", regex: /google|bing|yahoo/i } },
              "Organico",
              {
                $cond: [
                  { $regexMatch: { input: "$referrer", regex: /facebook|instagram|twitter|x\.com|tiktok/i } },
                  "Social",
                  {
                    $cond: [
                      { $eq: ["$referrer", ""] },
                      "Direto",
                      "Outros"
                    ]
                  }
                ]
              }
            ]
          },
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Taxa de retenção (usuários que geraram mais de 1 imagem)
    const usuariosAtivos = await Geracao.aggregate([
      { $group: { _id: "$usuario", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ]);
    
    const totalUsuarios = await Usuario.countDocuments();
    const taxaRetencao = totalUsuarios > 0 ? ((usuariosAtivos.length / totalUsuarios) * 100).toFixed(2) : 0;
    
    res.json({
      success: true,
      estrategias: {
        canaisAquisicao: canais,
        taxaRetencao: `${taxaRetencao}%`,
        recomendacoes: [
          "Implementar programa de indicação (DONE)",
          "Criar conteúdo viral no TikTok/Instagram Reels",
          "Parcerias com influencers de design/arte",
          "SEO para keywords 'transformar foto em anime/desenho'",
          "Google Ads para 'avatar IA'",
          "Programa de afiliados com comissão",
          "Integração com WhatsApp para compartilhamento fácil",
          "Templates virais (foto de perfil estilo Pixar, etc)"
        ]
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============== TRANSFORM IMAGE ==============

app.post("/api/transform", auth, upload.single("image"), async (req, res) => {
  let tempFile = req.file?.path;
  
  try {
    const user = await Usuario.findOneAndUpdate(
      { _id: req.userId, creditos: { $gte: 1 } },
      { $inc: { creditos: -1 }, lastActive: new Date() },
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
    const strength = Math.min(Math.max(parseFloat(req.body.strength) || 0.75, 0.1), 1.0);

    console.log("Fazendo upload para Cloudinary...");
    
    const cloudResult = await cloudinary.uploader.upload(tempFile, {
      folder: "morph_uploads",
      resource_type: "image"
    });

    console.log("Upload concluído:", cloudResult.secure_url);

    await fs.promises.unlink(tempFile).catch(() => {});
    tempFile = null;

    console.log("Enviando para InstantID...");
    
    const resultado = await queue.add(async () => {
      const output = await replicate.run(
        "instantx/instantid:6af8583c541261472e92155d87bba80d5e5c5c6717f895b61454783c319b435b",
        {
          input: {
            image: cloudResult.secure_url,
            prompt: prompt,
            negative_prompt: "blurry, low quality, distorted face, ugly, deformed, extra limbs, bad anatomy, watermark, signature",
            width: 512,
            height: 512,
            num_inference_steps: 30,
            guidance_scale: 7.5,
            ip_adapter_scale: strength,
            controlnet_conditioning_scale: 0.8
          }
        }
      );
      
      console.log("InstantID output:", output);
      return output;
    });

    if (!resultado || resultado.length === 0) {
      throw new Error("InstantID não retornou resultado");
    }

    let finalImageUrl = resultado[0];
    console.log("URL final:", finalImageUrl);

    await Geracao.create({
      usuario: req.userId,
      imagem: cloudResult.secure_url,
      resultado: finalImageUrl,
      prompt,
      custo: 1
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

app.get("/", (req, res) => res.json({ 
  status: "API ONLINE", 
  timestamp: new Date().toISOString(),
  endpoints: {
    auth: ["/api/auth/cadastro", "/api/auth/login"],
    app: ["/api/transform", "/api/historico"],
    admin: ["/api/admin/dashboard", "/api/admin/usuarios"],
    growth: ["/api/add-100-credits (temp)", "/api/referral/stats"]
  }
}));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: "Erro interno do servidor" });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`🚀 Server rodando na porta ${PORT}`));