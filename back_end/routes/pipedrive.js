const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { isAuthenticated } = require("../middlewares/authMiddleware");
const pipedriveService = require("../services/pipedriveService");

function requestUserId(req) {
  return req.user?.id || req.user?.sub || req.user?._id || req.userObj?._id;
}

function frontendIntegrationsUrl() {
  const base = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
  if (base) return `${base}/integrations`;
  return process.env.NODE_ENV === "production"
    ? "https://mawsool.tech/integrations"
    : "http://localhost:3000/integrations";
}

function oauthAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.PIPEDRIVE_CLIENT_ID,
    redirect_uri: process.env.PIPEDRIVE_REDIRECT_URI,
    state: String(state),
  });
  return `https://oauth.pipedrive.com/oauth/authorize?${params.toString()}`;
}

router.get("/connect", isAuthenticated, (req, res) => {
  if (!pipedriveService.isOAuthConfigured()) {
    return res.status(503).send("Pipedrive OAuth is not configured.");
  }
  const userId = requestUserId(req);
  if (!userId) {
    return res.status(400).send("User ID not found in request");
  }
  res.redirect(oauthAuthorizeUrl(userId));
});

router.get("/callback", async (req, res) => {
  const code = req.query.code;
  const userId = req.query.state;
  const dest = frontendIntegrationsUrl();

  if (!code || !userId) {
    return res.redirect(`${dest}?pipedrive=error`);
  }

  try {
    const tokens = await pipedriveService.exchangeCode(code);
    await pipedriveService.saveOAuthTokens(userId, tokens);
    res.redirect(`${dest}?pipedrive=connected`);
  } catch (error) {
    console.error("[Pipedrive] OAuth error:", error?.message || error);
    res.redirect(`${dest}?pipedrive=error`);
  }
});

router.get("/status", isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(requestUserId(req));
    if (!user) return res.status(404).json({ error: "User not found" });
    const isConnected = !!(user.pipedrive && user.pipedrive.refreshToken);
    res.json({ isConnected, configured: pipedriveService.isOAuthConfigured() });
  } catch (error) {
    console.error("[Pipedrive] status error:", error?.message || error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/disconnect", isAuthenticated, async (req, res) => {
  try {
    await User.findByIdAndUpdate(requestUserId(req), {
      $set: {
        "pipedrive.accessToken": null,
        "pipedrive.refreshToken": null,
        "pipedrive.apiDomain": null,
        "pipedrive.expiresAt": null,
      },
    });
    res.json({ message: "Disconnected successfully", isConnected: false });
  } catch (error) {
    console.error("[Pipedrive] disconnect error:", error?.message || error);
    res.status(500).json({ error: "Internal server error" });
  }
});

function usableContact(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower === "not available" || lower === "n/a" || lower.includes("not available")) {
    return "";
  }
  return s.split(",")[0].trim();
}

router.post("/push-leads", isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(requestUserId(req));
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.pipedrive?.refreshToken && !user.pipedrive?.accessToken) {
      return res.status(403).json({ error: "Pipedrive is not connected" });
    }

    const incoming = Array.isArray(req.body?.leads) ? req.body.leads : [];
    const leads = incoming.map((lead) => ({
      name: String(lead?.name || "").trim(),
      linkedin_url: String(lead?.linkedin_url || lead?.linkedinUrl || "").trim(),
      title: String(lead?.title || "").trim(),
      company: String(lead?.company || "").trim(),
      location: String(lead?.location || "").trim(),
      email: usableContact(lead?.email),
      phone: usableContact(lead?.phone),
    }));

    const result = await pipedriveService.withUserAuthRetry(user, (auth) =>
      pipedriveService.pushLeads(auth, leads)
    );
    res.json(result);
  } catch (error) {
    const status = error.status || 500;
    if (status === 403) {
      return res.status(403).json({ error: "Pipedrive is not connected" });
    }
    console.error("[Pipedrive] push-leads error:", error?.message || error);
    res.status(status).json({ error: "Failed to push leads to Pipedrive" });
  }
});

module.exports = router;
