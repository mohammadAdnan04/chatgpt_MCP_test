const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/revealController');

// Protect all reveal routes with authentication
router.use(isAuthenticated);

router.post('/contact', ctrl.revealContact);
router.post('/bundle', ctrl.revealBundle);
router.post('/bundle-search', ctrl.revealBundleSearch);
// Check if a profileUrl has already been revealed (phone/email) for current user
router.get('/check', ctrl.checkReveal);
router.get('/values', ctrl.getRevealValues);

// GET /api/reveal/list/:listId/revealed-contacts - Get revealed contacts for a specific list
router.get('/list/:listId/revealed-contacts', ctrl.getRevealedContactsForList);

// --- User Reveal Management Routes ---
// GET /api/reveal/user/history - Get user's reveal history with pagination
router.get('/user/history', ctrl.getUserRevealHistory);

// GET /api/reveal/stats - Get user's reveal statistics
router.get('/stats', ctrl.getRevealStats);

module.exports = router;
