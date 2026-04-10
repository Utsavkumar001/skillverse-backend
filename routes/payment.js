const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const authMiddleware = require('../middleware/auth');
const Agent = require('../models/Agent');
const User = require('../models/User');
const ChatHistory = require('../models/ChatHistory');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const PLATFORM_CUT = 0.20; // 20% platform
const CREATOR_SHARE = 0.80; // 80% creator

// POST /api/payment/create-order
router.post('/create-order', authMiddleware, async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user.id);
    if (!user.isEmailVerified) {
      return res.status(403).json({ 
        message: 'Please verify your email before making payments.',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    const { amount, agentId } = req.body;

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: `order_${Date.now()}`,
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error('Razorpay error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/payment/verify
router.post('/verify', authMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, agentId } = req.body;

    // Verify signature
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generated = hmac.digest('hex');

    if (generated !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    // Get agent details
    const agent = await Agent.findById(agentId).populate('creatorId');
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    // Calculate earnings
    const totalAmount = agent.price;
    const creatorEarning = Math.round(totalAmount * CREATOR_SHARE * 100) / 100;
    const platformEarning = Math.round(totalAmount * PLATFORM_CUT * 100) / 100;

    // Add to creator wallet
    await User.findByIdAndUpdate(agent.creatorId._id, {
      $inc: {
        walletBalance: creatorEarning,
        totalEarned: creatorEarning,
      },
    });

    // Mark chat as paid
    await ChatHistory.findOneAndUpdate(
      { userId: req.user.id, agentId: agent._id },
      { isPaid: true },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: 'Payment verified',
      breakdown: {
        total: totalAmount,
        creatorEarning,
        platformEarning,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;