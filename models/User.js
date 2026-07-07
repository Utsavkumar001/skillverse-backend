const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ['user', 'creator', 'admin'],
      default: 'user'
    },
    avatar: { type: String, default: '' },
    bio: { type: String, default: '' }, // ← Creator bio
    isVerified: { type: Boolean, default: false },
    resetToken: { type: String, default: null },
    resetTokenExpiry: { type: Date, default: null },
    walletBalance: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 },
    withdrawalRequests: [
      {
        amount: { type: Number },
        status: { type: String, enum: ['pending', 'paid', 'rejected'], default: 'pending' },
        requestedAt: { type: Date, default: Date.now },
        upiId: { type: String },
      }
    ],
    isEmailVerified: { type: Boolean, default: false },
    emailVerifyToken: { type: String, default: null },
    isBanned: { type: Boolean, default: false },
    banReason: { type: String, default: null },

    // Creator Application
    creatorStatus: {
      type: String,
      enum: ['none', 'pending', 'approved', 'rejected'],
      default: 'none'
    },
    creatorApplication: {
      expertise: { type: String, default: '' },
      reason: { type: String, default: '' },
      portfolio: { type: String, default: '' },
      linkedin: { type: String, default: '' },
      appliedAt: { type: Date, default: null },
      rejectionReason: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);