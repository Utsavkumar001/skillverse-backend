const mongoose = require('mongoose');

const AgentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: {
      type: String,
      enum: ['learning', 'coding', 'career', 'research', 'productivity', 'creative'],
      required: true,
    },
    systemPrompt: { type: String, required: true }, // The hidden prompt that defines the agent
    examplePrompts: [{ type: String }],             // Shown to users as suggestions
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    price: { type: Number, default: 0 },            // 0 = free
    pricingModel: { type: String, enum: ['free', 'one-time', 'monthly'], default: 'free' },
    tags: [{ type: String }],
    usageCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
    averageRating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    capabilities: [{ type: String }],
    status: { 
  type: String, 
  enum: ['draft', 'pending_review', 'published', 'rejected'], 
  default: 'draft' 
},


  },
  { timestamps: true }
);
 
module.exports = mongoose.model('Agent', AgentSchema);