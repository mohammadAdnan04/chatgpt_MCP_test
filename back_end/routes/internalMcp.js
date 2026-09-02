const express = require("express");
const mcpProxyController = require("../controllers/mcpProxyController");

/**
 * ChatGPT MCP only. Claude continues to use /api/oauth/mcp/* with opaque tokens.
 * Auth: X-Mawsool-Internal-Secret + X-Mawsool-User-Email.
 */
const router = express.Router();

router.get("/credits", mcpProxyController.getCredits);
router.post("/search", mcpProxyController.search);
router.post("/contact", mcpProxyController.contact);
router.post("/full-info", mcpProxyController.fullInfo);
router.post("/save-to-list", mcpProxyController.saveToList);

module.exports = router;
