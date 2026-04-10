const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { Resend } = require('resend');
const { body, validationResult } = require('express-validator');

const resend = new Resend(process.env.RESEND_API_KEY);

// Register validation middleware
const validateRegister = [
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Invalid email address'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

// Login validation middleware
const validateLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Invalid email'),
  body('password').notEmpty().withMessage('Password is required'),
];

// Validation result checker
const checkValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }
  next();
};

// POST /api/auth/register
router.post('/register', validateRegister, checkValidation, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'User already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const emailVerifyToken = crypto.randomBytes(32).toString('hex');

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashed,
      role: role || 'buyer',
      emailVerifyToken,
      isEmailVerified: false,
    });

    // Send verification email
    try {
      const verifyUrl = `${process.env.FRONTEND_URL}/verify-email/${emailVerifyToken}`;
      await resend.emails.send({
        from: 'SkillVerse <onboarding@resend.dev>',
        to: user.email,
        subject: 'Verify your SkillVerse email',
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #111827;">Welcome to SkillVerse! 👋</h2>
            <p style="color: #6B7280;">Click below to verify your email and get started.</p>
            <a href="${verifyUrl}" style="display: inline-block; background: #111827; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; margin: 16px 0;">
              Verify Email
            </a>
            <p style="color: #9CA3AF; font-size: 12px;">If you didn't create this account, ignore this email.</p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error('Email send failed:', emailErr.message);
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name,
        email: user.email,
        role: user.role,
        isEmailVerified: false,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/login
router.post('/login', validateLogin, checkValidation, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid credentials' });

    // Ban check — yeh add karo
    if (user.isBanned) {
      return res.status(403).json({ 
        message: `Account banned: ${user.banReason || 'Violated terms of service'}` 
      });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password -emailVerifyToken -resetToken -resetTokenExpiry');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/verify-email/:token
router.get('/verify-email/:token', async (req, res) => {
  try {
    const user = await User.findOne({ emailVerifyToken: req.params.token });
    if (!user) return res.status(400).json({ message: 'Invalid or expired verification link' });

    user.isEmailVerified = true;
    user.emailVerifyToken = null;
    await user.save();

    res.json({ message: 'Email verified successfully!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/resend-verification
router.post('/resend-verification', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user.isEmailVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }

    const emailVerifyToken = crypto.randomBytes(32).toString('hex');
    user.emailVerifyToken = emailVerifyToken;
    await user.save();

    const verifyUrl = `${process.env.FRONTEND_URL}/verify-email/${emailVerifyToken}`;
    await resend.emails.send({
      from: 'SkillVerse <onboarding@resend.dev>',
      to: user.email,
      subject: 'Verify your SkillVerse email',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #111827;">Verify your email</h2>
          <a href="${verifyUrl}" style="display: inline-block; background: #111827; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; margin: 16px 0;">
            Verify Email
          </a>
        </div>
      `,
    });

    res.json({ message: 'Verification email sent!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/auth/verify/:userId — admin verify
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

// GET /api/auth/earnings
router.get('/earnings', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('walletBalance totalEarned withdrawalRequests');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/withdraw
router.post('/withdraw', authMiddleware, async (req, res) => {
  try {
    const { amount, upiId } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.walletBalance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }
    if (amount < 100) {
      return res.status(400).json({ message: 'Minimum withdrawal is ₹100' });
    }

    user.walletBalance -= amount;
    user.withdrawalRequests.push({ amount, upiId, status: 'pending' });
    await user.save();

    res.json({
      success: true,
      message: 'Withdrawal request submitted! We will process within 3-5 business days.',
      newBalance: user.walletBalance,
    });
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

    const token = crypto.randomBytes(32).toString('hex');
    user.resetToken = token;
    user.resetTokenExpiry = Date.now() + 3600000;
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;
    await resend.emails.send({
      from: 'SkillVerse <onboarding@resend.dev>',
      to: user.email,
      subject: 'Reset your SkillVerse password',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #111827;">Reset your password</h2>
          <p style="color: #6B7280;">This link expires in 1 hour.</p>
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