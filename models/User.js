const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['buyer', 'creator', 'both'], default: 'buyer' },
    avatar: { type: String, default: '' },
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
  },
  
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);