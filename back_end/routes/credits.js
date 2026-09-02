const express = require("express");
const router = express.Router();
const creditController = require("../controllers/creditController");
const { isAuthenticated } = require("../middlewares/authMiddleware");

router.get("/", isAuthenticated, creditController.getCredits);
router.post("/transfer", isAuthenticated, creditController.transferCredits);
router.post("/deductCredits", isAuthenticated, creditController.deductCredits);
router.get("/history", isAuthenticated, creditController.getCreditHistory);

module.exports = router;
