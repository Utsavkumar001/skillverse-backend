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

// GET /api/agents/:id/analytics
router.get('/:id/analytics', authMiddleware, async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    if (agent.creatorId.toString() !== req.user.id)
      return res.status(403).json({ message: 'Not your agent' });

    const ChatHistory = require('../models/ChatHistory');
    const Review = require('../models/Review');

    const chats = await ChatHistory.find({ agentId: req.params.id });
    const reviews = await Review.find({ agentId: req.params.id });

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date.setHours(0, 0, 0, 0));
      const dayEnd = new Date(date.setHours(23, 59, 59, 999));

      const msgs = chats.reduce((count, chat) => {
        return count + chat.messages.filter(m =>
          new Date(m.timestamp) >= dayStart &&
          new Date(m.timestamp) <= dayEnd &&
          m.role === 'user'
        ).length;
      }, 0);

      last7Days.push({
        date: dayStart.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
        messages: msgs,
      });
    }

    const paidUsers = chats.filter(c => c.isPaid).length;
    const totalUsers = chats.length;
    const totalMessages = chats.reduce((sum, c) => sum + Math.floor(c.messages.length / 2), 0);
    const revenue = paidUsers * agent.price;
    const avgRating = reviews.length
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : 0;

    res.json({
      totalUsers,
      paidUsers,
      totalMessages,
      revenue,
      avgRating,
      reviewCount: reviews.length,
      usageCount: agent.usageCount,
      last7Days,
    });
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
    // Email verification check
    const User = require('../models/User');
    const user = await User.findById(req.user.id);
    if (!user.isEmailVerified) {
      return res.status(403).json({
        message: 'Please verify your email before creating agents.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    if (user.role !== 'creator' && user.role !== 'admin') {
  return res.status(403).json({ 
    message: 'Only creators can build agents.',
    code: 'NOT_CREATOR'
  });
}

    const { title, description, category, systemPrompt, examplePrompts, price, pricingModel, tags, capabilities } = req.body;

    const agent = await Agent.create({
      title,
      description,
      category,
      systemPrompt,
      examplePrompts,
      price: price || 0,
      capabilities: capabilities || [],
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

router.patch('/:id/publish', authMiddleware, async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user.id);
    
    // Sirf admin publish kar sakta hai
    if (user.role !== 'admin') {
      return res.status(403).json({ 
        message: 'Agents require admin approval before publishing.' 
      });
    }

    const agent = await Agent.findByIdAndUpdate(
      req.params.id,
      { isPublished: true },
      { new: true }
    );
    res.json(agent);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/agents/:id — edit agent
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    if (agent.creatorId.toString() !== req.user.id)
      return res.status(403).json({ message: 'Not your agent' });

    const { title, description, category, systemPrompt, examplePrompts, price, pricingModel, tags, capabilities } = req.body;

    agent.title = title || agent.title;
    agent.description = description || agent.description;
    agent.category = category || agent.category;
    agent.systemPrompt = systemPrompt || agent.systemPrompt;
    agent.examplePrompts = examplePrompts || agent.examplePrompts;
    agent.price = price !== undefined ? price : agent.price;
    agent.pricingModel = pricingModel || agent.pricingModel;
    agent.tags = tags || agent.tags;
    agent.capabilities = capabilities || agent.capabilities;

    await agent.save();
    res.json(agent);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/agents/:id/clone
router.post('/:id/clone', authMiddleware, async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user.id);
    if (!user.isEmailVerified) {
      return res.status(403).json({ message: 'Please verify your email first.' });
    }

    const original = await Agent.findById(req.params.id);
    if (!original) return res.status(404).json({ message: 'Agent not found' });

    const cloned = await Agent.create({
      title: `${original.title} (Copy)`,
      description: original.description,
      category: original.category,
      systemPrompt: original.systemPrompt,
      examplePrompts: original.examplePrompts,
      capabilities: original.capabilities,
      price: original.price,
      pricingModel: original.pricingModel,
      tags: original.tags,
      creatorId: req.user.id,
      isPublished: false,
    });

    res.status(201).json(cloned);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/agents/:id/submit-review
router.patch('/:id/submit-review', authMiddleware, async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    
    // Debug log
    console.log('Agent creatorId:', agent.creatorId.toString());
    console.log('Request user id:', req.user.id);
    
    if (agent.creatorId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Not your agent' });
    }

    agent.status = 'pending_review';
    await agent.save();

    res.json({ message: 'Submitted for review!', agent });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Publish route — sirf admin
router.patch('/:id/publish', authMiddleware, async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user.id);
    if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admin can publish agents.' });
    }
    const agent = await Agent.findByIdAndUpdate(
      req.params.id,
      { isPublished: true, status: 'published' },
      { new: true }
    );
    res.json(agent);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    
    const User = require('../models/User');
    const user = await User.findById(req.user.id);
    
    // Creator apna agent delete kar sake, admin koi bhi
    if (agent.creatorId.toString() !== req.user.id && user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    await Agent.findByIdAndDelete(req.params.id);
    res.json({ message: 'Agent deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;