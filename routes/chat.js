const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const Agent = require('../models/Agent');
const ChatHistory = require('../models/ChatHistory');
const authMiddleware = require('../middleware/auth');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const FREE_TRIAL_LIMIT = 3;

router.post('/:agentId', authMiddleware, async (req, res) => {
  try {
    const { message, history } = req.body;

    const agent = await Agent.findById(req.params.agentId);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    let chatHistory = await ChatHistory.findOne({
      userId: req.user.id,
      agentId: agent._id,
    });

    if (!chatHistory) {
      chatHistory = await ChatHistory.create({
        userId: req.user.id,
        agentId: agent._id,
        messages: [],
        trialCount: 0,
        isPaid: false,
      });
    }

    // Trial limit — sirf paid agents ke liye
    if (agent.price > 0 && !chatHistory.isPaid) {
      if (chatHistory.trialCount >= FREE_TRIAL_LIMIT) {
        return res.status(403).json({
          trialEnded: true,
          message: `Free trial ended. Purchase to continue.`,
        });
      }
    }

    const messages = [
      { role: 'system', content: agent.systemPrompt },
      ...(history || []),
      { role: 'user', content: message },
    ];

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      max_tokens: 800,
    });

    const reply = response.choices[0].message.content;

    // Count badhao sirf paid agents ke liye
    if (agent.price > 0 && !chatHistory.isPaid) {
      chatHistory.trialCount += 1;
    }

    chatHistory.messages.push(
      { role: 'user', content: message },
      { role: 'assistant', content: reply }
    );
    await chatHistory.save();

    agent.usageCount += 1;
    await agent.save();

    res.json({
      reply,
      trialCount: chatHistory.trialCount,
      trialLimit: FREE_TRIAL_LIMIT,
      isPaid: chatHistory.isPaid,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Mark as paid after successful payment
router.post('/:agentId/mark-paid', authMiddleware, async (req, res) => {
  try {
    await ChatHistory.findOneAndUpdate(
      { userId: req.user.id, agentId: req.params.agentId },
      { isPaid: true },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/chat/:agentId/status
router.get('/:agentId/status', authMiddleware, async (req, res) => {
  try {
    const chatHistory = await ChatHistory.findOne({
      userId: req.user.id,
      agentId: req.params.agentId,
    });
    res.json({ isPaid: chatHistory?.isPaid || false,
      trialCount: chatHistory?.trialCount || 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/chat/my-agents
router.get('/my-agents', authMiddleware, async (req, res) => {
  try {
    const histories = await ChatHistory.find({ userId: req.user.id })
      .populate('agentId')
      .sort({ updatedAt: -1 });

    const result = histories
      .filter((h) => h.agentId)
      .map((h) => ({
        agent: h.agentId,
        isPaid: h.isPaid,
        trialCount: h.trialCount,
      }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/chat/:agentId/history
router.get('/:agentId/history', authMiddleware, async (req, res) => {
  try {
    const chatHistory = await ChatHistory.findOne({
      userId: req.user.id,
      agentId: req.params.agentId,
    });

    if (!chatHistory) return res.json({ messages: [], trialCount: 0, isPaid: false });

    res.json({
      messages: chatHistory.messages,
      trialCount: chatHistory.trialCount,
      isPaid: chatHistory.isPaid,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/:agentId/embed — guest chat for embedded widget
router.post('/:agentId/embed', async (req, res) => {
  try {
    const { message, history } = req.body;
    const agent = await Agent.findById(req.params.agentId);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    const messages = [
      { role: 'system', content: agent.systemPrompt },
      ...(history || []),
      { role: 'user', content: message },
    ];

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      max_tokens: 600,
    });

    const reply = response.choices[0].message.content;
    agent.usageCount += 1;
    await agent.save();

    res.json({ reply });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});



module.exports = router;