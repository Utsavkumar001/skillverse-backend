const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { Resend } = require('resend');
const crypto = require('crypto');
const resend = new Resend(process.env.RESEND_API_KEY);
 
// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
 
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'User already exists' });
 
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: email.toLowerCase(), password: hashed, role: role || 'buyer' });
 
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });
 
    res.status(201).json({ token, user: { id: user._id, name, email, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
 
// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
 
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });
 
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid credentials' });
 
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });
 
    res.json({ token, user: { id: user._id, name: user.name, email, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
 
// GET /api/auth/me  — get logged in user
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/auth/verify/:userId — admin manually verify kare
router.patch('/verify/:userId', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { isVerified: true },
      { new: true }
    ).select('-password');
    res.json({ message: 'User verified', user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/stats
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const ChatHistory = require('../models/ChatHistory');
    const Agent = require('../models/Agent');

    const allChats = await ChatHistory.find({ userId: req.user.id });
    const agentsUsed = allChats.length;
    const agentsPurchased = allChats.filter((c) => c.isPaid).length;
    const agentsCreated = await Agent.countDocuments({ creatorId: req.user.id });

    res.json({ agentsUsed, agentsPurchased, agentsCreated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/auth/update-profile
router.patch('/update-profile', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name },
      { new: true }
    ).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) return res.status(404).json({ message: 'No account with this email' });

    // Generate reset token
    const token = crypto.randomBytes(32).toString('hex');
    user.resetToken = token;
    user.resetTokenExpiry = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send email
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;

    await resend.emails.send({
      from: 'SkillVerse <onboarding@resend.dev>',
      to: user.email,
      subject: 'Reset your SkillVerse password',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #111827;">Reset your password</h2>
          <p style="color: #6B7280;">Click the button below to reset your SkillVerse password. This link expires in 1 hour.</p>
          <a href="${resetUrl}" style="display: inline-block; background: #111827; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; margin: 16px 0;">
            Reset Password
          </a>
          <p style="color: #9CA3AF; font-size: 12px;">If you didn't request this, ignore this email.</p>
        </div>
      `,
    });

    res.json({ message: 'Reset email sent!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/reset-password/:token
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findOne({
      resetToken: req.params.token,
      resetTokenExpiry: { $gt: Date.now() },
    });

    if (!user) return res.status(400).json({ message: 'Invalid or expired reset link' });

    user.password = await bcrypt.hash(password, 10);
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();

    res.json({ message: 'Password reset successful!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

 
module.exports = router;
 
 