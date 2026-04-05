const express = require('express');
const router = express.Router();
const Agent = require('../models/Agent');
const authMiddleware = require('../middleware/auth');

// GET /api/agents — list all published agents (with search + filter)
router.get('/', async (req, res) => {
  try {
    const { category, search, sort } = req.query;
    const query = { isPublished: true };

    if (category) query.category = category;
    if (search) query.title = { $regex: search, $options: 'i' };

    let sortObj = { createdAt: -1 };
    if (sort === 'rating') sortObj = { averageRating: -1 };
    if (sort === 'popular') sortObj = { usageCount: -1 };

    const agents = await Agent.find(query)
      .populate('creatorId', 'name avatar isVerified')
      .sort(sortObj);

    res.json(agents);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/agents/creator/mine — get creator's own agents
router.get('/creator/mine', authMiddleware, async (req, res) => {
  try {
    const agents = await Agent.find({ creatorId: req.user.id }).sort({ createdAt: -1 });
    res.json(agents);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/agents/:id — single agent detail
router.get('/:id', async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id)
      .populate('creatorId', 'name avatar isVerified');
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/agents — create agent (creator only)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, category, systemPrompt, examplePrompts, price, pricingModel, tags } = req.body;

    const agent = await Agent.create({
      title,
      description,
      category,
      systemPrompt,
      examplePrompts,
      price: price || 0,
      pricingModel: pricingModel || 'free',
      tags,
      creatorId: req.user.id,
      isPublished: false,
    });

    res.status(201).json(agent);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/agents/:id/publish — publish agent
router.patch('/:id/publish', authMiddleware, async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    if (agent.creatorId.toString() !== req.user.id)
      return res.status(403).json({ message: 'Not your agent' });

    agent.isPublished = true;
    await agent.save();
    res.json({ message: 'Agent published', agent });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;