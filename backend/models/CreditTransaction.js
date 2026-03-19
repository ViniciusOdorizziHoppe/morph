const mongoose = require('mongoose');

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

module.exports = mongoose.model('CreditTransaction', transactionSchema);