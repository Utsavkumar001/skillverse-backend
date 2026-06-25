const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Agent = require('../models/Agent');

// GET /api/creator-profile/:id — creator info
router.get('/:id', async (req, res) => {
  try {
    const creator = await User.findById(req.params.id)
      .select('name isVerified creatorApplication createdAt');

    if (!creator || creator.role === 'user') {
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

module.exports = router;