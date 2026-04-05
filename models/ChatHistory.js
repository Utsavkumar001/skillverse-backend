const mongoose = require('mongoose');

const ChatHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true },
    messages: [
      {
        role: { type: String, enum: ['user', 'assistant'] },
        content: { type: String },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    trialCount: { type: Number, default: 0 }, // ← free messages count
    isPaid: { type: Boolean, default: false }, // ← payment done?
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChatHistory', ChatHistorySchema);