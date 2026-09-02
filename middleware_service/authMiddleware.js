const { getModel } = require('./models/User');

/**
 * Authentication Middleware for Middleware Service
 * Checks for a valid X-API-KEY header in the request.
 * If the key matches the internal site key, it bypasses credits.
 * Otherwise, it validates against the external api.mawsool.tech users.
 */
const authenticateApiKey = async (req, res, next) => {
    // 1. Get the key from headers
    const key = req.headers['x-api-key'];

    if (!key) {
        return res.status(401).json({ 
            error: "Authentication required. Please provide X-API-KEY in headers." 
        });
    }

    try {
        // 2. Check if it's the internal back_end key
        if (key === process.env.MAWSOOL_MIDDLEWARE_KEY) {
            req.isInternal = true;
            return next();
        }

        // 3. Otherwise, validate as an external api.mawsool.tech user
        const User = getModel();
        const userDoc = await User.findOne({ apiKey: key, isActive: true });

        if (!userDoc) {
            return res.status(403).json({ 
                error: "Invalid or inactive API Key." 
            });
        }

        // 4. Check if they have enough credits to even start a search (need at least 1)
        if (userDoc.credits <= 0) {
            return res.status(403).json({
                error: "Insufficient credits. Please recharge your account."
            });
        }

        // 5. Check for Special API Users (Live Enrichment)
        // Parse special keys from .env, comma-separated
        const specialKeysStr = process.env.SPECIAL_API_KEYS || "";
        const specialKeys = specialKeysStr.split(',').map(k => k.trim()).filter(Boolean);
        req.isSpecialApiUser = specialKeys.includes(key);

        // 6. Attach user info to request for credit tracking later
        req.isInternal = false;
        req.apiUser = userDoc;

        next();
    } catch (error) {
        console.error("[Auth] Database error:", error.message);
        return res.status(500).json({ error: "Internal server error during authentication." });
    }
};

module.exports = authenticateApiKey;
