const mongoose = require('mongoose');
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

module.exports = mongoose.model('User', userSchema);