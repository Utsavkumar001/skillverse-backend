const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Agent = require('../models/Agent');
const ChatHistory = require('../models/ChatHistory');
const adminAuth = require('../middleware/adminAuth');

// GET /api/admin/stats — overview
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: { $ne: 'admin' } });
    const totalAgents = await Agent.countDocuments();
    const publishedAgents = await Agent.countDocuments({ isPublished: true });
    const pendingAgents = await Agent.countDocuments({ isPublished: false });
    const bannedUsers = await User.countDocuments({ isBanned: true });
    const verifiedUsers = await User.countDocuments({ isEmailVerified: true });

    // Total revenue
    const users = await User.find({ role: { $ne: 'admin' } });
    const totalRevenue = users.reduce((sum, u) => sum + (u.totalEarned || 0), 0);

    res.json({
      totalUsers,
      totalAgents,
      publishedAgents,
      pendingAgents,
      bannedUsers,
      verifiedUsers,
      totalRevenue,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin/users — all users
router.get('/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'admin' } })
      .select('-password -resetToken -resetTokenExpiry -emailVerifyToken')
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/admin/users/:id/ban — ban user
router.patch('/users/:id/ban', adminAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBanned: true, banReason: reason || 'Violated terms of service' },
      { new: true }
    ).select('-password');
    res.json({ message: 'User banned', user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/admin/users/:id/unban — unban user
router.patch('/users/:id/unban', adminAuth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBanned: false, banReason: null },
      { new: true }
    ).select('-password');
    res.json({ message: 'User unbanned', user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/admin/users/:id/verify — manually verify creator
router.patch('/users/:id/verify', adminAuth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isVerified: true, isEmailVerified: true },
      { new: true }
    ).select('-password');
    res.json({ message: 'User verified', user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin/agents — all agents
router.get('/agents', adminAuth, async (req, res) => {
  try {
    const agents = await Agent.find()
      .populate('creatorId', 'name email isVerified')
      .sort({ createdAt: -1 });
    res.json(agents);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/admin/agents/:id/approve — approve agent
router.patch('/agents/:id/approve', adminAuth, async (req, res) => {
  try {
    const agent = await Agent.findByIdAndUpdate(
      req.params.id,
      { isPublished: true },
      { new: true }
    );
    res.json({ message: 'Agent approved', agent });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/admin/agents/:id/reject — unpublish agent
router.patch('/agents/:id/reject', adminAuth, async (req, res) => {
  try {
    const agent = await Agent.findByIdAndUpdate(
      req.params.id,
      { isPublished: false },
      { new: true }
    );
    res.json({ message: 'Agent rejected', agent });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/admin/agents/:id — delete agent
router.delete('/agents/:id', adminAuth, async (req, res) => {
  try {
    await Agent.findByIdAndDelete(req.params.id);
    res.json({ message: 'Agent deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;