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
    systemPrompt: { type: String, default: '' },
    examplePrompts: [{ type: String }],
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Pricing
    price: { type: Number, default: 0 },
    monthlyPrice: { type: Number, default: 0 },
    yearlyPrice: { type: Number, default: 0 },
    pricingModel: {
      type: String,
      enum: ['free', 'freemium', 'one-time', 'monthly', 'yearly'],
      default: 'free'
    },
    freeQueriesPerDay: { type: Number, default: 0 },
    freeQueriesPerMonth: { type: Number, default: 0 },

    // External API
    agentType: { type: String, enum: ['internal', 'external'], default: 'internal' },
    externalApiUrl: { type: String, default: '' },

    tags: [{ type: String }],
    usageCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
    averageRating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    capabilities: [{ type: String }],
    
    // Knowledge Sources ← YAHI MISSING THA
    knowledgeSources: [{
      type: String,
      enum: [
        'Books', 'Research Papers', 'Personal Notes',
        'Company SOPs', 'Videos', 'PDFs',
        'Fine-tuned Model', 'External API',
        'IIT/University Notes', 'GATE/Exam PYQs'
      ],
    }],

    status: {
      type: String,
      enum: ['draft', 'pending_review', 'published', 'rejected'],
      default: 'draft'
    },

    // Versioning
    version: { type: String, default: '1.0' },
    changelog: [
      {
        version: { type: String },
        date: { type: Date, default: Date.now },
        changes: [{ type: String }],
      }
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Agent', AgentSchema);