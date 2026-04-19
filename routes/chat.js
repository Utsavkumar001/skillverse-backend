const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const axios = require('axios');
const Agent = require('../models/Agent');
const ChatHistory = require('../models/ChatHistory');
const authMiddleware = require('../middleware/auth');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const FREE_TRIAL_LIMIT = 3;

// Helper — AI se reply lo (internal ya external)
const getReply = async (agent, message, recentHistory) => {
  // External agent
  if (agent.agentType === 'external' && agent.externalApiUrl) {
    const response = await axios.post(agent.externalApiUrl, {
      message,
      history: recentHistory,
    });
    return response.data.reply;
  }

  // Internal — Groq
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

  return response.choices[0].message.content;
};

// Helper — query limit check
const checkQueryLimit = (agent, chatHistory) => {
  // Free — no limit
  if (agent.pricingModel === 'free') return { allowed: true };

  // Paid — check if purchased
  if (['one-time', 'monthly', 'yearly'].includes(agent.pricingModel)) {
    if (chatHistory.isPaid) return { allowed: true };
    // Free trial
    if (chatHistory.trialCount >= FREE_TRIAL_LIMIT) {
      return { allowed: false, trialEnded: true, message: 'Free trial ended. Purchase to continue.' };
    }
    return { allowed: true, isTrial: true };
  }

  // Freemium — check daily/monthly limits
  if (agent.pricingModel === 'freemium') {
    if (chatHistory.isPaid) return { allowed: true };

    const now = new Date();

    // Daily limit check
    if (agent.freeQueriesPerDay > 0) {
      const todayStart = new Date(now.setHours(0, 0, 0, 0));
      const todayMessages = chatHistory.messages.filter(m =>
        m.role === 'user' && new Date(m.timestamp) >= todayStart
      ).length;

      if (todayMessages >= agent.freeQueriesPerDay) {
        return {
          allowed: false,
          trialEnded: true,
          message: `Daily free limit of ${agent.freeQueriesPerDay} queries reached. Come back tomorrow or upgrade!`
        };
      }
    }

    // Monthly limit check
    if (agent.freeQueriesPerMonth > 0) {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthMessages = chatHistory.messages.filter(m =>
        m.role === 'user' && new Date(m.timestamp) >= monthStart
      ).length;

      if (monthMessages >= agent.freeQueriesPerMonth) {
        return {
          allowed: false,
          trialEnded: true,
          message: `Monthly free limit of ${agent.freeQueriesPerMonth} queries reached. Upgrade to continue!`
        };
      }
    }

    return { allowed: true };
  }

  return { allowed: true };
};

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

    const recentHistory = (history || []).slice(-6).map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    const reply = await getReply(agent, message, recentHistory);

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
      { upsert: true, returnDocument: 'after' }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/chat/:agentId — main chat route
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

    // Query limit check
    const limitCheck = checkQueryLimit(agent, chatHistory);
    if (!limitCheck.allowed) {
      return res.status(403).json({
        trialEnded: true,
        message: limitCheck.message,
      });
    }

    const recentHistory = (history || []).slice(-6).map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    const reply = await getReply(agent, message, recentHistory);

    // Trial count badhao
    if (['one-time', 'monthly', 'yearly'].includes(agent.pricingModel) && !chatHistory.isPaid) {
      chatHistory.trialCount += 1;
    }

    chatHistory.messages.push(
      { role: 'user', content: message, timestamp: new Date() },
      { role: 'assistant', content: reply, timestamp: new Date() }
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