const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const oauthController = require("../controllers/oauthController");
const mcpProxyController = require("../controllers/mcpProxyController");
const { isAuthenticated } = require("../middlewares/authMiddleware");

const softAuth = async (req, res, next) => {
  const token = req.cookies?.["auth-token"];
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.sub || decoded.id || decoded._id;
    if (!userId) return next();
    const user = await User.findById(userId);
    if (!user) return next();
    req.user = { ...decoded, id: userId, sub: userId };
    req.userObj = user;
  } catch (_) {
    // ignore invalid cookie
  }
  next();
};

const publicRouter = express.Router();
publicRouter.get("/authorize", softAuth, oauthController.getAuthorize);
publicRouter.post("/token", oauthController.exchangeToken);
publicRouter.post("/register", oauthController.registerClient);
publicRouter.post("/introspect", oauthController.introspect);
publicRouter.post("/revoke", oauthController.revokeToken);

const apiRouter = express.Router();
apiRouter.get("/authorize/validate", softAuth, oauthController.validateAuthorize);
apiRouter.post("/authorize", isAuthenticated, oauthController.postAuthorize);

// Balance only — morphology happens inside MCP website proxies below
apiRouter.get("/credits", oauthController.getAccountCredits);
apiRouter.get("/mcp/credits", mcpProxyController.getCredits);

// Claude tools → website. Website owns data + wallet morphology.
apiRouter.post("/mcp/search", mcpProxyController.search);
apiRouter.post("/mcp/contact", mcpProxyController.contact);
apiRouter.post("/mcp/full-info", mcpProxyController.fullInfo);
apiRouter.post("/mcp/save-to-list", mcpProxyController.saveToList);

module.exports = { publicRouter, apiRouter, oauthController };
