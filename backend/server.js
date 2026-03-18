require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const fs = require("fs");
const Replicate = require("replicate");
const PQueue = require("p-queue").default;
const cloudinary = require("cloudinary").v2;
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors({
  origin: [
    "https://morph-one-tan.vercel.app"
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

/* ================= CONFIG ================= */

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN
});

mongoose.connect(process.env.MONGO_URI);

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
  status: {
    type: String,
    enum: ["pending", "processing", "done", "error"],
    default: "pending"
  },
  tentativas: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
}));

/* ================= FILAS ================= */

// prioridade por plano
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

    if (diff < 5000) {
      throw new Error("Espere 5 segundos entre requisições");
    }
  }

  user.lastRequest = new Date();
  await user.save();
}

/* ================= UPLOAD ================= */

const upload = multer({ dest: "uploads/" });

/* ================= CORE PROCESS ================= */

async function processImage(jobId) {
  try {
    const job = await Geracao.findById(jobId).populate("usuario");
    if (!job) return;

    const user = job.usuario;

    job.status = "processing";
    await job.save();

    if (user.creditos <= 0) {
      job.status = "error";
      await job.save();
      return;
    }

    const queue = getQueue(user.plano);

    await queue.add(async () => {

      let model, input;

      if (user.plano === "premium") {
        model = "black-forest-labs/flux-dev";
        input = {
          prompt: `${job.prompt}, ultra realistic, 8k`,
          image: job.imagem
        };
      } else {
        model = "stability-ai/stable-diffusion-img2img:15a3689ee13b0d2616e98820eca31d4c3abcd36672df6afce5cb6feb1d66087d";
        input = {
          image: job.imagem,
          prompt: job.prompt,
          strength: 0.75
        };
      }

      console.log("🚀 PROCESSANDO:", job._id);

      let output;

      try {
        output = await replicate.run(model, { input });
      } catch (err) {
        console.log("⚠️ ERRO IA, tentando novamente...");
        
        if (job.tentativas < 2) {
          job.tentativas++;
          await job.save();
          return processImage(jobId);
        } else {
          throw err;
        }
      }

      if (!output || output.length === 0) {
        throw new Error("Sem resultado");
      }

      let finalUrl;

      if (typeof output[0] === "string") {
        finalUrl = output[0];
      } else {
        const chunks = [];
        for await (const chunk of output[0]) {
          chunks.push(chunk);
        }

        const buffer = Buffer.concat(chunks);

        const upload = await cloudinary.uploader.upload(
          `data:image/png;base64,${buffer.toString("base64")}`
        );

        finalUrl = upload.secure_url;
      }

      await Usuario.findByIdAndUpdate(user._id, {
        $inc: { creditos: -1 }
      });

      job.resultado = finalUrl;
      job.status = "done";
      await job.save();

      console.log("✅ FINALIZADO:", job._id);

    });

  } catch (err) {
    console.error("🔥 ERRO FINAL:", err);

    await Geracao.findByIdAndUpdate(jobId, {
      status: "error"
    });
  }
}

/* ================= ROTAS ================= */

// 🔥 TRANSFORM
app.post("/api/transform", upload.single("image"), async (req, res) => {
  try {
    const user = await Usuario.findById(req.userId);

    if (!user) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    await antiSpam(user);

    if (!req.file) {
      return res.status(400).json({ error: "Sem imagem" });
    }

    const uploadResult = await cloudinary.uploader.upload(req.file.path);
    await fs.promises.unlink(req.file.path).catch(() => {});

    const job = await Geracao.create({
      usuario: user._id,
      imagem: uploadResult.secure_url,
      prompt: req.body.prompt || "a person",
      status: "pending"
    });

    processImage(job._id);

    res.json({
      success: true,
      jobId: job._id
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔥 STATUS
app.get("/api/status/:id", async (req, res) => {
  try {
    const job = await Geracao.findById(req.params.id);

    if (!job) {
      return res.status(404).json({ error: "Job não encontrado" });
    }

    res.json({
      status: job.status,
      imageUrl: job.resultado || null
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔥 HISTÓRICO
app.get("/api/historico", async (req, res) => {
  try {
    const historico = await Geracao.find({ usuario: req.userId })
      .sort({ createdAt: -1 })
      .limit(20);

    res.json(historico);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= START ================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🔥 Server rodando na porta", PORT);
});