const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['buyer', 'creator', 'both'], default: 'buyer' },
    avatar: { type: String, default: '' },
    isVerified: { type: Boolean, default: false }, // ← yeh add karo
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);