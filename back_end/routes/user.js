const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { isAuthenticated } = require("../middlewares/authMiddleware");

router.get("/profile", isAuthenticated, userController.getProfile);

router.put("/update-profile", isAuthenticated, userController.updateProfile);

router.get("/verify-email", userController.verifyEmail);

module.exports = router;
