const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Agent = require('../models/Agent');
const authMiddleware = require('../middleware/auth');

// GET /api/creator-profile/:id — creator public profile
router.get('/:id', async (req, res) => {
  try {
    const creator = await User.findById(req.params.id)
      .select('name role bio isVerified creatorApplication createdAt');

    if (!creator) {
      return res.status(404).json({ message: 'Creator not found' });
    }

    // Sirf creator aur admin ka profile dikhao
    if (creator.role !== 'creator' && creator.role !== 'admin') {
      return res.status(404).json({ message: 'Creator not found' });
    }

    res.json(creator);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/creator-profile/:id/agents — creator's published agents
router.get('/:id/agents', async (req, res) => {
  try {
    const agents = await Agent.find({
      creatorId: req.params.id,
      isPublished: true,
    }).sort({ usageCount: -1 });

    res.json(agents);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/creator-profile/update-bio — creator apna bio update kare
router.patch('/update-bio', authMiddleware, async (req, res) => {
  try {
    const { bio, name } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { bio, name },
      { new: true }
    ).select('name bio isVerified creatorApplication role');

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;