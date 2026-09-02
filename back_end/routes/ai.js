const express = require("express");
const router = express.Router();
const { isAuthenticated } = require("../middlewares/authMiddleware");
const aiController = require("../controllers/aiController");

router.post("/submit", isAuthenticated, aiController.submitQuery);

// Parse natural language to filters
router.post("/parse-filters", isAuthenticated, aiController.parseFilters);

// Get status of AI query
router.get("/:id", isAuthenticated, aiController.getQueryStatus);

module.exports = router;
