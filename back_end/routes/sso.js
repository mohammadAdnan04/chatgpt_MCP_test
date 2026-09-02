const express = require("express");
const router = express.Router();
const ssoController = require("../controllers/ssoController");
const requireAuth = require("../auth/requireAuth");

// Generate SSO token - requires authentication (auth cookie)
router.post("/generate-sso-token", requireAuth, ssoController.generateSSOToken);

// Validate SSO token - public endpoint for extension
router.post("/validate-sso-token", ssoController.validateSSOToken);

module.exports = router;