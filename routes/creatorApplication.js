const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// POST /api/creator-application/apply
router.post('/apply', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (user.role === 'creator') {
      return res.status(400).json({ message: 'You are already a creator.' });
    }
    if (user.creatorStatus === 'pending') {
      return res.status(400).json({ message: 'Application already submitted. Please wait for review.' });
    }

    const { expertise, reason, portfolio, linkedin } = req.body;

    if (!expertise || !reason) {
      return res.status(400).json({ message: 'Expertise and reason are required.' });
    }

    user.creatorStatus = 'pending';
    user.creatorApplication = {
      expertise,
      reason,
      portfolio: portfolio || '',
      linkedin: linkedin || '',
      appliedAt: new Date(),
      rejectionReason: '',
    };

    await user.save();

    res.json({ message: 'Application submitted! We will review and get back to you.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/creator-application/status — user apna status dekhe
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('creatorStatus creatorApplication role');
    res.json({
      creatorStatus: user.creatorStatus,
      creatorApplication: user.creatorApplication,
      role: user.role,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/creator-application/all — admin ko sab applications
router.get('/all', adminAuth, async (req, res) => {
  try {
    const applications = await User.find({ creatorStatus: { $in: ['pending', 'approved', 'rejected'] } })
      .select('name email creatorStatus creatorApplication createdAt')
      .sort({ 'creatorApplication.appliedAt': -1 });

    res.json(applications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/creator-application/:id/approve — admin approve
router.patch('/:id/approve', adminAuth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        role: 'creator',
        creatorStatus: 'approved',
        isVerified: true,
      },
      { new: true }
    ).select('-password');

    res.json({ message: `${user.name} is now a verified creator!`, user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/creator-application/:id/reject — admin reject
router.patch('/:id/reject', adminAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        creatorStatus: 'rejected',
        'creatorApplication.rejectionReason': reason || 'Does not meet our creator criteria.',
      },
      { new: true }
    ).select('-password');

    res.json({ message: `Application rejected.`, user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;