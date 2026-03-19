const mongoose = require('mongoose');

const generationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Imagem de entrada
  inputImage: {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    width: Number,
    height: Number,
    format: String
  },
  
  // Imagem gerada
  outputImage: {
    url: String,
    publicId: String,
    width: Number,
    height: Number,
    format: String
  },
  
  // Parâmetros da geração
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
  
  // Status e metadados
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },
  
  errorMessage: String,
  
  // Performance
  processingTime: Number, // em segundos
  queueTime: Number,      // tempo na fila
  
  // Custo
  creditsUsed: {
    type: Number,
    default: 1
  },
  
  // Feedback do usuário
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  
  isPublic: {
    type: Boolean,
    default: false
  },
  
  // Referência ao job na fila
  jobId: String
  
}, {
  timestamps: true
});

// Índices para queries comuns
generationSchema.index({ createdAt: -1 });
generationSchema.index({ status: 1, createdAt: -1 });

// Método para marcar como completo
generationSchema.methods.markCompleted = async function(outputUrl, outputPublicId, metadata = {}) {
  this.status = 'completed';
  this.outputImage = {
    url: outputUrl,
    publicId: outputPublicId,
    ...metadata
  };
  this.processingTime = (Date.now() - this.createdAt.getTime()) / 1000;
  await this.save();
};

// Método para marcar como falho
generationSchema.methods.markFailed = async function(errorMessage) {
  this.status = 'failed';
  this.errorMessage = errorMessage;
  this.processingTime = (Date.now() - this.createdAt.getTime()) / 1000;
  await this.save();
};

module.exports = mongoose.model('Generation', generationSchema);