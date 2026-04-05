const express = require('express');
const router = express.Router();
const Review = require('../models/Review');
const Agent = require('../models/Agent');
const authMiddleware = require('../middleware/auth');
 
// GET /api/reviews/:agentId
router.get('/:agentId', async (req, res) => {
  try {
    const reviews = await Review.find({ agentId: req.params.agentId })
      .populate('userId', 'name avatar')
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
 
// POST /api/reviews/:agentId
router.post('/:agentId', authMiddleware, async (req, res) => {
  try {
    const { rating, comment } = req.body;
 
    const review = await Review.create({
      agentId: req.params.agentId,
      userId: req.user.id,
      rating,
      comment,
    });
 
    // Recalculate average rating on the agent
    const allReviews = await Review.find({ agentId: req.params.agentId });
    const avg = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
 
    await Agent.findByIdAndUpdate(req.params.agentId, {
      averageRating: Math.round(avg * 10) / 10,
      reviewCount: allReviews.length,
    });
 
    res.status(201).json(review);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
 
module.exports = router;