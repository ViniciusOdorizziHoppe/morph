const mongoose = require('mongoose');

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

module.exports = mongoose.model('Generation', generationSchema);