const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const Agent = require('../models/Agent');
const ChatHistory = require('../models/ChatHistory');
const authMiddleware = require('../middleware/auth');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const FREE_TRIAL_LIMIT = 3;

// GET /api/chat/my-agents — PEHLE specific routes
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

// GET /api/chat/:agentId/status
router.get('/:agentId/status', authMiddleware, async (req, res) => {
  try {
    const chatHistory = await ChatHistory.findOne({
      userId: req.user.id,
      agentId: req.params.agentId,
    });
    res.json({
      isPaid: chatHistory?.isPaid || false,
      trialCount: chatHistory?.trialCount || 0,
    });
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

// POST /api/chat/:agentId/embed — guest chat (no auth)
router.post('/:agentId/embed', async (req, res) => {
  try {
    const { message, history } = req.body;
    const agent = await Agent.findById(req.params.agentId);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    // Sirf last 10 messages bhejo Groq ko
    const recentHistory = (history || []).slice(-6);
    
    const messages = [
      { role: 'system', content: agent.systemPrompt },
      ...recentHistory,
      { role: 'user', content: message },
    ];

    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages,
      max_tokens: 1024,
    });

    const reply = response.choices[0].message.content;
    agent.usageCount += 1;
    await agent.save();

    res.json({ reply });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/:agentId/mark-paid
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

// POST /api/chat/:agentId — main chat route (SABSE LAST)
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

    if (agent.price > 0 && !chatHistory.isPaid) {
      if (chatHistory.trialCount >= FREE_TRIAL_LIMIT) {
        return res.status(403).json({
          trialEnded: true,
          message: `Free trial ended. Purchase to continue.`,
        });
      }
    }

    // ← YEH 3 LINES CHANGE HUI HAIN
    const recentHistory = (history || []).slice(-6).map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    const messages = [
      { role: 'system', content: agent.systemPrompt },
      ...recentHistory,
      { role: 'user', content: message },
    ];

    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',  // ← CHANGE
      messages,
      max_tokens: 1024,  // ← CHANGE
    });

    const reply = response.choices[0].message.content;

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
    console.error('CHAT ERROR:', err.status, err.message, err.error);
    if (err.status === 429) {
      return res.status(429).json({ message: 'AI is busy, please wait and try again.' });
    }
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;