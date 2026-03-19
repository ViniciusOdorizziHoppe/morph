const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, 'backend');

const files = {
  // CONFIG
  'config/cloudinary.js': `const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

const UPLOAD_PRESETS = {
  userUploads: {
    folder: 'morph_uploads',
    resource_type: 'image',
    type: 'upload',
    access_mode: 'public',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 1024, height: 1024, crop: 'limit' },
      { quality: 'auto:good' }
    ],
    overwrite: false,
    unique_filename: true
  },
  generatedImages: {
    folder: 'morph_generated',
    resource_type: 'image',
    type: 'upload',
    access_mode: 'public',
    transformation: [
      { quality: 'auto:best' },
      { fetch_format: 'auto' }
    ]
  }
};

module.exports = { cloudinary, UPLOAD_PRESETS };`,

  'config/database.js': `const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('MongoDB Connected:', conn.connection.host);
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

module.exports = connectDB;`,

  'config/replicate.js': `const Replicate = require('replicate');

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const MODELS = {
  primary: "black-forest-labs/flux-1-dev",
  secondary: "black-forest-labs/flux-1-schnell",
  fallback: "stability-ai/stable-diffusion-xl-base-1.0"
};

const DEFAULT_PARAMS = {
  strength: 0.75,
  num_inference_steps: 28,
  guidance_scale: 3.5,
  aspect_ratio: "1:1",
  output_format: "png",
  output_quality: 100,
  go_fast: false
};

module.exports = { replicate, MODELS, DEFAULT_PARAMS };`,

  // UTILS
  'utils/promptBuilder.js': `const STYLE_TEMPLATES = {
  professional: {
    prefix: "professional photography, 8k resolution, highly detailed, sharp focus, cinematic composition, studio quality lighting",
    suffix: "masterpiece, best quality, ultra detailed",
    negative: "blurry, low quality, distorted, amateur, watermark, text, signature"
  },
  artistic: {
    prefix: "masterpiece, best quality, digital art, trending on artstation, intricate details",
    suffix: "beautiful composition, vibrant colors, stunning artwork",
    negative: "photorealistic, 3d render, ugly, deformed, noisy, blurry"
  },
  realistic: {
    prefix: "photorealistic, RAW photo, DSLR quality, natural lighting, 8k uhd, high detailed skin",
    suffix: "sharp focus on eyes, professional portrait photography",
    negative: "painting, drawing, illustration, 3d render, cartoon, anime"
  },
  cinematic: {
    prefix: "cinematic film still, depth of field, dramatic lighting, anamorphic lens, 35mm film",
    suffix: "epic composition, movie poster quality, atmospheric",
    negative: "amateur, home video, low budget, flat lighting"
  },
  anime: {
    prefix: "masterpiece, best quality, anime style, detailed background, vibrant colors, cel shaded",
    suffix: "beautiful detailed eyes, high quality illustration",
    negative: "photorealistic, 3d, western cartoon, live action"
  }
};

class PromptBuilder {
  static build(userPrompt, options = {}) {
    const { style = 'professional', strength = 0.75 } = options;
    const template = STYLE_TEMPLATES[style] || STYLE_TEMPLATES.professional;
    
    let finalPrompt = template.prefix;
    
    if (strength < 0.5) {
      finalPrompt += ", maintaining the original composition and subject";
    }
    
    finalPrompt += \`. \${userPrompt}\`;
    finalPrompt += \`. \${template.suffix}\`;
    
    if (strength > 0.8) {
      finalPrompt += ", inspired by the reference image composition";
    }

    return {
      prompt: this.cleanPrompt(finalPrompt),
      negativePrompt: template.negative,
      style,
      strength,
      originalPrompt: userPrompt
    };
  }

  static cleanPrompt(prompt) {
    return prompt
      .replace(/\\s+/g, ' ')
      .replace(/,\\s*,/g, ',')
      .replace(/\\.\\s*\\./g, '.')
      .trim();
  }

  static validate(userPrompt) {
    const errors = [];
    
    if (!userPrompt || userPrompt.trim().length === 0) {
      errors.push('Prompt não pode estar vazio');
    }
    
    if (userPrompt.length > 1000) {
      errors.push('Prompt muito longo (máximo 1000 caracteres)');
    }
    
    if (userPrompt.length < 3) {
      errors.push('Prompt muito curto (mínimo 3 caracteres)');
    }
    
    const blockedWords = ['nsfw', 'nude', 'naked', 'porn', 'sex'];
    const hasBlocked = blockedWords.some(word => 
      userPrompt.toLowerCase().includes(word)
    );
    
    if (hasBlocked) {
      errors.push('Prompt contém conteúdo não permitido');
    }
    
    return { isValid: errors.length === 0, errors };
  }
}

module.exports = PromptBuilder;`,

  'utils/logger.js': `const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'morph-api' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

module.exports = logger;`,

  'utils/validators.js': `const { body, validationResult } = require('express-validator');

const validateGenerationRequest = [
  body('prompt')
    .trim()
    .isLength({ min: 3, max: 1000 })
    .withMessage('Prompt deve ter entre 3 e 1000 caracteres'),
  
  body('strength')
    .optional()
    .isFloat({ min: 0.1, max: 1.0 })
    .withMessage('Strength deve estar entre 0.1 e 1.0'),
  
  body('style')
    .optional()
    .isIn(['professional', 'artistic', 'realistic', 'cinematic', 'anime'])
    .withMessage('Estilo inválido')
];

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(e => ({
        field: e.param,
        message: e.msg
      }))
    });
  }
  next();
};

module.exports = { validateGenerationRequest, handleValidationErrors };`,

  // MIDDLEWARE
  'middleware/upload.js': `const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/temp/');
  },
  filename: (req, file, cb) => {
    const uniqueName = \`\${uuidv4()}\${path.extname(file.originalname)}\`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
  
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Formato de arquivo não suportado. Use: JPG, PNG ou WebP'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1
  }
});

const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Arquivo muito grande. Máximo 10MB.'
      });
    }
    return res.status(400).json({
      success: false,
      message: 'Erro no upload: ' + err.message
    });
  }
  
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  next();
};

module.exports = { uploadSingle: upload.single('image'), handleUploadError };`,

  'middleware/auth.js': `const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Acesso negado. Token não fornecido.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não encontrado.'
      });
    }

    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: 'Conta suspensa.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Token inválido.'
    });
  }
};

module.exports = { auth };`,

  'middleware/errorHandler.js': `const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Erro de validação',
      errors: Object.values(err.errors).map(e => e.message)
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'ID inválido'
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      message: 'Dados duplicados'
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Erro interno do servidor' 
      : err.message
  });
};

module.exports = errorHandler;`,

  // MODELS
  'models/User.js': `const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
    select: false
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  credits: {
    type: Number,
    default: 0,
    min: 0
  },
  totalGenerations: {
    type: Number,
    default: 0
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isBanned: {
    type: Boolean,
    default: false
  },
  stripeCustomerId: String,
  preferences: {
    defaultStyle: {
      type: String,
      enum: ['professional', 'artistic', 'realistic', 'cinematic', 'anime'],
      default: 'professional'
    },
    defaultStrength: {
      type: Number,
      default: 0.75,
      min: 0.1,
      max: 1.0
    }
  }
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.useCredit = async function() {
  if (this.credits < 1) {
    throw new Error('Créditos insuficientes');
  }
  
  this.credits -= 1;
  this.totalGenerations += 1;
  await this.save();
  
  return this.credits;
};

module.exports = mongoose.model('User', userSchema);`,

  'models/Generation.js': `const mongoose = require('mongoose');

const generationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  inputImage: {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    width: Number,
    height: Number,
    format: String
  },
  
  outputImage: {
    url: String,
    publicId: String,
    width: Number,
    height: Number,
    format: String
  },
  
  prompt: {
    original: { type: String, required: true },
    enhanced: { type: String, required: true },
    negative: String
  },
  
  settings: {
    style: String,
    strength: { type: Number, required: true },
    aspectRatio: String,
    model: String,
    inferenceSteps: Number,
    guidanceScale: Number
  },
  
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },
  
  errorMessage: String,
  processingTime: Number,
  queueTime: Number,
  creditsUsed: { type: Number, default: 1 },
  rating: { type: Number, min: 1, max: 5 },
  isPublic: { type: Boolean, default: false },
  jobId: String
  
}, { timestamps: true });

generationSchema.index({ createdAt: -1 });
generationSchema.index({ status: 1, createdAt: -1 });

generationSchema.methods.markCompleted = async function(outputUrl, outputPublicId, metadata = {}) {
  this.status = 'completed';
  this.outputImage = { url: outputUrl, publicId: outputPublicId, ...metadata };
  this.processingTime = (Date.now() - this.createdAt.getTime()) / 1000;
  await this.save();
};

generationSchema.methods.markFailed = async function(errorMessage) {
  this.status = 'failed';
  this.errorMessage = errorMessage;
  this.processingTime = (Date.now() - this.createdAt.getTime()) / 1000;
  await this.save();
};

module.exports = mongoose.model('Generation', generationSchema);`,

  'models/CreditTransaction.js': `const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  type: {
    type: String,
    enum: ['purchase', 'usage', 'refund', 'bonus', 'promotion'],
    required: true
  },
  
  amount: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  description: String,
  paymentId: String,
  paymentProvider: String,
  generation: { type: mongoose.Schema.Types.ObjectId, ref: 'Generation' },
  metadata: mongoose.Schema.Types.Mixed
  
}, { timestamps: true });

module.exports = mongoose.model('CreditTransaction', transactionSchema);`,

  // SERVICES
  'services/cloudinaryService.js': `const { cloudinary, UPLOAD_PRESETS } = require('../config/cloudinary');
const logger = require('../utils/logger');

class CloudinaryService {
  async uploadUserImage(filePath, userId) {
    try {
      const result = await cloudinary.uploader.upload(filePath, {
        ...UPLOAD_PRESETS.userUploads,
        folder: \`morph_uploads/\${userId}\`,
        type: 'upload',
        access_mode: 'public',
        context: {
          userId: userId.toString(),
          uploadedAt: new Date().toISOString()
        }
      });

      logger.info(\`Image uploaded for user \${userId}: \${result.public_id}\`);

      return {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes
      };
    } catch (error) {
      logger.error('Cloudinary upload error:', error);
      throw new Error('Falha ao fazer upload da imagem');
    }
  }

  async uploadGeneratedImage(imageUrl, userId, generationId) {
    try {
      const result = await cloudinary.uploader.upload(imageUrl, {
        ...UPLOAD_PRESETS.generatedImages,
        folder: \`morph_generated/\${userId}\`,
        public_id: \`gen_\${generationId}\`,
        overwrite: true,
        context: {
          userId: userId.toString(),
          generationId: generationId.toString(),
          createdAt: new Date().toISOString()
        }
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format
      };
    } catch (error) {
      logger.error('Cloudinary generated upload error:', error);
      throw new Error('Falha ao salvar imagem gerada');
    }
  }

  async validateImageUrl(url) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      
      if (!response.ok) {
        return { valid: false, error: 'URL not accessible' };
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.startsWith('image/')) {
        return { valid: false, error: 'URL is not an image' };
      }

      return { valid: true, contentType };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  async deleteImage(publicId) {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result.result === 'ok';
    } catch (error) {
      logger.error('Cloudinary delete error:', error);
      return false;
    }
  }
}

module.exports = new CloudinaryService();`,

  'services/imageGenerationService.js': `const { replicate, MODELS, DEFAULT_PARAMS } = require('../config/replicate');
const cloudinaryService = require('./cloudinaryService');
const PromptBuilder = require('../utils/promptBuilder');
const logger = require('../utils/logger');

class ImageGenerationService {
  constructor() {
    this.models = MODELS;
    this.defaultParams = DEFAULT_PARAMS;
  }

  async generateFromImage(inputImageUrl, userPrompt, options = {}) {
    const startTime = Date.now();
    
    try {
      const validation = await cloudinaryService.validateImageUrl(inputImageUrl);
      if (!validation.valid) {
        throw new Error(\`Imagem de entrada inválida: \${validation.error}\`);
      }

      const {
        style = 'professional',
        strength = this.defaultParams.strength,
        aspectRatio = this.defaultParams.aspect_ratio,
        goFast = false
      } = options;

      const promptData = PromptBuilder.build(userPrompt, { style, strength });

      logger.info('Starting image generation', {
        inputImage: inputImageUrl,
        originalPrompt: userPrompt,
        enhancedPrompt: promptData.prompt,
        strength
      });

      const prediction = await replicate.run(this.models.primary, {
        input: {
          image: inputImageUrl,
          prompt: promptData.prompt,
          strength: parseFloat(strength),
          num_inference_steps: goFast ? 20 : 28,
          guidance_scale: this.defaultParams.guidance_scale,
          aspect_ratio: aspectRatio,
          output_format: this.defaultParams.output_format,
          output_quality: this.defaultParams.output_quality,
          go_fast: goFast
        }
      });

      if (!prediction || !prediction.output) {
        throw new Error('API retornou resposta vazia');
      }

      const processingTime = (Date.now() - startTime) / 1000;

      logger.info('Image generation completed', {
        processingTime,
        outputUrl: prediction.output
      });

      return {
        success: true,
        outputUrl: prediction.output,
        metadata: {
          originalPrompt: userPrompt,
          enhancedPrompt: promptData.prompt,
          negativePrompt: promptData.negativePrompt,
          strength,
          style,
          aspectRatio,
          model: this.models.primary,
          processingTime
        }
      };

    } catch (error) {
      logger.error('Image generation failed:', error);
      
      if (!error.message.includes('inválido') && !error.message.includes('Prompt')) {
        return this.generateWithFallback(inputImageUrl, userPrompt, options);
      }

      throw error;
    }
  }

  async generateWithFallback(inputImageUrl, userPrompt, options) {
    logger.warn('Trying fallback model');
    
    try {
      const promptData = PromptBuilder.build(userPrompt, {
        style: options.style || 'professional',
        strength: options.strength
      });

      const prediction = await replicate.run(this.models.secondary, {
        input: {
          image: inputImageUrl,
          prompt: promptData.prompt,
          strength: parseFloat(options.strength) || 0.75,
          num_inference_steps: 20,
          guidance_scale: 3.5,
          aspect_ratio: options.aspectRatio || '1:1',
          go_fast: true
        }
      });

      if (!prediction || !prediction.output) {
        throw new Error('Fallback também falhou');
      }

      return {
        success: true,
        outputUrl: prediction.output,
        metadata: {
          ...promptData,
          model: this.models.secondary,
          isFallback: true
        }
      };

    } catch (error) {
      logger.error('Fallback generation failed:', error);
      throw new Error('Todos os modelos de IA falharam. Tente novamente mais tarde.');
    }
  }
}

module.exports = new ImageGenerationService();`,

  'services/creditService.js': `const User = require('../models/User');
const CreditTransaction = require('../models/CreditTransaction');
const logger = require('../utils/logger');

class CreditService {
  async useCreditForGeneration(userId, generationId) {
    const session = await User.startSession();
    session.startTransaction();

    try {
      const user = await User.findById(userId).session(session);
      
      if (!user) throw new Error('Usuário não encontrado');
      if (user.credits < 1) throw new Error('Créditos insuficientes');

      user.credits -= 1;
      user.totalGenerations += 1;
      await user.save({ session });

      const transaction = new CreditTransaction({
        user: userId,
        type: 'usage',
        amount: -1,
        balanceAfter: user.credits,
        description: 'Uso em geração de imagem',
        generation: generationId
      });
      await transaction.save({ session });

      await session.commitTransaction();
      
      logger.info(\`Credit used for user \${userId}, remaining: \${user.credits}\`);
      
      return { success: true, remainingCredits: user.credits };

    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async addCredits(userId, amount, paymentData = {}) {
    const session = await User.startSession();
    session.startTransaction();

    try {
      const user = await User.findById(userId).session(session);
      if (!user) throw new Error('Usuário não encontrado');

      const previousBalance = user.credits;
      user.credits += amount;
      await user.save({ session });

      const transaction = new CreditTransaction({
        user: userId,
        type: 'purchase',
        amount: amount,
        balanceAfter: user.credits,
        description: \`Compra de \${amount} créditos\`,
        paymentId: paymentData.paymentId,
        paymentProvider: paymentData.provider
      });
      await transaction.save({ session });

      await session.commitTransaction();

      return {
        success: true,
        previousBalance,
        newBalance: user.credits,
        added: amount
      };

    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async getBalance(userId) {
    const user = await User.findById(userId).select('credits totalGenerations');
    if (!user) throw new Error('Usuário não encontrado');
    
    return {
      credits: user.credits,
      totalGenerations: user.totalGenerations
    };
  }

  async refundCredit(userId, generationId, reason = 'Geração falhou') {
    const session = await User.startSession();
    session.startTransaction();

    try {
      const user = await User.findById(userId).session(session);
      user.credits += 1;
      await user.save({ session });

      const transaction = new CreditTransaction({
        user: userId,
        type: 'refund',
        amount: 1,
        balanceAfter: user.credits,
        description: \`Reembolso: \${reason}\`,
        generation: generationId
      });
      await transaction.save({ session });

      await session.commitTransaction();
      return { success: true, newBalance: user.credits };

    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}

module.exports = new CreditService();`,

  'services/queueService.js': `const Queue = require('bull');
const logger = require('../utils/logger');

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD
};

const imageGenerationQueue = new Queue('image-generation', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50
  }
});

imageGenerationQueue.on('completed', (job, result) => {
  logger.info(\`Job \${job.id} completed\`, { generationId: job.data.generationId });
});

imageGenerationQueue.on('failed', (job, err) => {
  logger.error(\`Job \${job.id} failed\`, { generationId: job.data.generationId, error: err.message });
});

class QueueService {
  async addGenerationJob(data) {
    const { generationId, userId, inputImageUrl, prompt, settings, priority = 5 } = data;

    const job = await imageGenerationQueue.add(
      'generate-image',
      { generationId, userId, inputImageUrl, prompt, settings },
      {
        priority,
        jobId: generationId.toString(),
        timeout: 120000
      }
    );

    return {
      jobId: job.id,
      queuePosition: await imageGenerationQueue.count(),
      status: 'queued'
    };
  }

  async getJobStatus(jobId) {
    const job = await imageGenerationQueue.getJob(jobId);
    if (!job) return { status: 'unknown', exists: false };

    const state = await job.getState();
    return {
      status: state,
      exists: true,
      progress: job.progress(),
      attempts: job.attemptsMade,
      failedReason: job.failedReason
    };
  }

  async getQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
      imageGenerationQueue.getWaitingCount(),
      imageGenerationQueue.getActiveCount(),
      imageGenerationQueue.getCompletedCount(),
      imageGenerationQueue.getFailedCount()
    ]);

    return { waiting, active, completed, failed, total: waiting + active };
  }

  getQueue() {
    return imageGenerationQueue;
  }
}

module.exports = new QueueService();`,

  // JOBS
  'jobs/imageGenerationJob.js': `const imageGenerationService = require('../services/imageGenerationService');
const cloudinaryService = require('../services/cloudinaryService');
const creditService = require('../services/creditService');
const Generation = require('../models/Generation');
const logger = require('../utils/logger');

async function processImageGenerationJob(job) {
  const { generationId, userId, inputImageUrl, prompt, settings } = job.data;
  const startTime = Date.now();

  try {
    const generation = await Generation.findById(generationId);
    if (!generation) throw new Error('Geração não encontrada');

    generation.status = 'processing';
    generation.jobId = job.id.toString();
    await generation.save();

    const result = await imageGenerationService.generateFromImage(
      inputImageUrl,
      prompt.original,
      {
        style: settings.style,
        strength: settings.strength,
        aspectRatio: settings.aspectRatio,
        goFast: false
      }
    );

    const uploadResult = await cloudinaryService.uploadGeneratedImage(
      result.outputUrl,
      userId,
      generationId
    );

    await generation.markCompleted(uploadResult.url, uploadResult.publicId, {
      width: uploadResult.width,
      height: uploadResult.height,
      format: uploadResult.format
    });

    generation.processingTime = (Date.now() - startTime) / 1000;
    await generation.save();

    return {
      success: true,
      outputUrl: uploadResult.url,
      processingTime: generation.processingTime
    };

  } catch (error) {
    logger.error(\`Job failed\`, { jobId: job.id, error: error.message });

    const generation = await Generation.findById(generationId);
    if (generation) {
      await generation.markFailed(error.message);
      
      const isUserError = error.message.includes('Prompt') || 
                         error.message.includes('inválido') ||
                         error.message.includes('Imagem');
      
      if (!isUserError) {
        try {
          await creditService.refundCredit(userId, generationId, error.message);
        } catch (refundError) {
          logger.error('Failed to refund credit', { error: refundError.message });
        }
      }
    }

    throw error;
  }
}

module.exports = processImageGenerationJob;`,

  // CONTROLLERS
  'controllers/imageController.js': `const Generation = require('../models/Generation');
const cloudinaryService = require('../services/cloudinaryService');
const queueService = require('../services/queueService');
const creditService = require('../services/creditService');
const PromptBuilder = require('../utils/promptBuilder');
const logger = require('../utils/logger');

class ImageController {
  async uploadAndGenerate(req, res, next) {
    try {
      const userId = req.user._id;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ success: false, message: 'Nenhuma imagem enviada' });
      }

      const { prompt, strength = 0.75, style = 'professional', aspectRatio = '1:1' } = req.body;

      const promptValidation = PromptBuilder.validate(prompt);
      if (!promptValidation.isValid) {
        return res.status(400).json({ success: false, errors: promptValidation.errors });
      }

      const balance = await creditService.getBalance(userId);
      if (balance.credits < 1) {
        return res.status(403).json({
          success: false,
          message: 'Créditos insuficientes',
          currentCredits: balance.credits
        });
      }

      let uploadResult;
      try {
        uploadResult = await cloudinaryService.uploadUserImage(file.path, userId);
      } catch (error) {
        return res.status(500).json({ success: false, message: 'Falha ao processar imagem' });
      }

      const promptData = PromptBuilder.build(prompt, { style, strength: parseFloat(strength) });

      const generation = new Generation({
        user: userId,
        inputImage: {
          url: uploadResult.url,
          publicId: uploadResult.publicId,
          width: uploadResult.width,
          height: uploadResult.height,
          format: uploadResult.format
        },
        prompt: {
          original: prompt,
          enhanced: promptData.prompt,
          negative: promptData.negativePrompt
        },
        settings: {
          style,
          strength: parseFloat(strength),
          aspectRatio,
          model: 'flux-1-dev'
        },
        status: 'pending'
      });

      await generation.save();

      try {
        await creditService.useCreditForGeneration(userId, generation._id);
      } catch (error) {
        await cloudinaryService.deleteImage(uploadResult.publicId);
        await Generation.findByIdAndDelete(generation._id);
        return res.status(403).json({ success: false, message: error.message });
      }

      const queueResult = await queueService.addGenerationJob({
        generationId: generation._id,
        userId,
        inputImageUrl: uploadResult.url,
        prompt: { original: prompt },
        settings: { style, strength: parseFloat(strength), aspectRatio },
        priority: req.user.role === 'admin' ? 1 : 5
      });

      res.status(202).json({
        success: true,
        message: 'Geração iniciada',
        data: {
          generationId: generation._id,
          status: 'queued',
          queuePosition: queueResult.queuePosition,
          creditsRemaining: balance.credits - 1
        }
      });

    } catch (error) {
      logger.error('Upload and generate error:', error);
      next(error);
    }
  }

  async getGenerationStatus(req, res, next) {
    try {
      const { generationId } = req.params;
      const generation = await Generation.findOne({ _id: generationId, user: req.user._id });

      if (!generation) {
        return res.status(404).json({ success: false, message: 'Geração não encontrada' });
      }

      let queueStatus = null;
      if (generation.jobId && generation.status === 'pending') {
        queueStatus = await queueService.getJobStatus(generation.jobId);
      }

      res.json({
        success: true,
        data: {
          generationId: generation._id,
          status: generation.status,
          inputImage: generation.inputImage.url,
          outputImage: generation.outputImage?.url,
          prompt: generation.prompt.original,
          settings: generation.settings
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserGenerations(req, res, next) {
    try {
      const generations = await Generation.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .limit(20);

      res.json({
        success: true,
        data: generations.map(g => ({
          id: g._id,
          status: g.status,
          inputImage: g.inputImage.url,
          outputImage: g.outputImage?.url,
          prompt: g.prompt.original,
          createdAt: g.createdAt
        }))
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ImageController();`,

  'controllers/creditController.js': `const creditService = require('../services/creditService');

class CreditController {
  async getBalance(req, res, next) {
    try {
      const balance = await creditService.getBalance(req.user._id);
      res.json({ success: true, data: balance });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CreditController();`,

  // ROUTES
  'routes/imageRoutes.js': `const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { uploadSingle, handleUploadError } = require('../middleware/upload');
const { validateGenerationRequest, handleValidationErrors } = require('../utils/validators');
const imageController = require('../controllers/imageController');

router.post(
  '/generate',
  auth,
  uploadSingle,
  handleUploadError,
  validateGenerationRequest,
  handleValidationErrors,
  imageController.uploadAndGenerate.bind(imageController)
);

router.get('/generations', auth, imageController.getUserGenerations.bind(imageController));
router.get('/generations/:generationId', auth, imageController.getGenerationStatus.bind(imageController));

module.exports = router;`,

  'routes/creditRoutes.js': `const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const creditController = require('../controllers/creditController');

router.get('/balance', auth, creditController.getBalance.bind(creditController));

module.exports = router;`,

  // APP E SERVER (SEM HELMET)
  'app.js': `const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const errorHandler = require('./middleware/errorHandler');
const imageRoutes = require('./routes/imageRoutes');
const creditRoutes = require('./routes/creditRoutes');

const app = express();

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Muitas requisições' }
});
app.use('/api/', limiter);

const generationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5
});
app.use('/api/images/generate', generationLimiter);

// Body parsing
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/images', imageRoutes);
app.use('/api/credits', creditRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Rota não encontrada' });
});

// Error handler
app.use(errorHandler);

module.exports = app;`,

  'server.js': `require('dotenv').config();

const app = require('./app');
const connectDB = require('./config/database');
const queueService = require('./services/queueService');
const processImageGenerationJob = require('./jobs/imageGenerationJob');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3001;

// Conectar DB
connectDB();

// Configurar worker
const imageQueue = queueService.getQueue();
imageQueue.process('generate-image', 2, processImageGenerationJob);

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully');
  await imageQueue.close();
  process.exit(0);
});

app.listen(PORT, () => {
  logger.info('Server running on port ' + PORT);
});`,

  // PACKAGE.JSON
  'package.json': JSON.stringify({
    name: "morph-api",
    version: "2.0.0",
    description: "AI Image Generation API",
    main: "server.js",
    scripts: {
      start: "node server.js",
      dev: "nodemon server.js"
    },
    dependencies: {
      bcryptjs: "^2.4.3",
      bull: "^4.12.0",
      cloudinary: "^1.41.0",
      compression: "^1.7.4",
      cors: "^2.8.5",
      dotenv: "^16.3.1",
      express: "^4.18.2",
      "express-rate-limit": "^7.1.5",
      "express-validator": "^7.0.1",
      jsonwebtoken: "^9.0.2",
      mongoose: "^8.0.0",
      multer: "^1.4.5-lts.1",
      replicate: "^0.25.0",
      stripe: "^14.5.0",
      uuid: "^9.0.1",
      winston: "^3.11.0"
    },
    devDependencies: {
      nodemon: "^3.0.2"
    },
    engines: {
      node: ">=18.0.0"
    }
  }, null, 2),

  // ENV EXAMPLE
  '.env.example': `# Server
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:3000

# Database
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/morph

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Cloudinary
CLOUDINARY_CLOUD_NAME=seu_cloud_name
CLOUDINARY_API_KEY=sua_api_key
CLOUDINARY_API_SECRET=seu_api_secret

# Replicate
REPLICATE_API_TOKEN=seu_token_aqui

# JWT
JWT_SECRET=sua_chave_secreta_jwt
JWT_EXPIRE=7d

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Logging
LOG_LEVEL=info`
};

// Criar todos os arquivos
console.log('Criando arquivos...\n');

Object.entries(files).forEach(([filePath, content]) => {
  const fullPath = path.join(baseDir, filePath);
  const dir = path.dirname(fullPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log('✓', filePath);
});

console.log('\n✅ Estrutura criada com sucesso!');
console.log('\nPróximos passos:');
console.log('1. cd backend');
console.log('2. npm install');
console.log('3. Configure o .env');
console.log('4. npm run dev');