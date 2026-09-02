const crypto = require("crypto");
const User = require("../models/User");
const SSOToken = require("../models/SSOToken");

// Rate limiting storage (in production, use Redis or similar)
const rateLimitStore = new Map();

// Clean up rate limit store periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now - data.windowStart > 60000) { // 1 minute window
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean every minute

// Rate limiting helper
const checkRateLimit = (userId) => {
  const key = `sso_${userId}`;
  const now = Date.now();
  const windowStart = now - 60000; // 1 minute window
  
  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return true;
  }
  
  const data = rateLimitStore.get(key);
  
  // Reset window if expired
  if (now - data.windowStart > 60000) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return true;
  }
  
  // Check if limit exceeded
  if (data.count >= 5) {
    return false;
  }
  
  // Increment count
  data.count++;
  return true;
};

// Clean up expired tokens periodically
const cleanupExpiredTokens = async () => {
  try {
    await SSOToken.deleteMany({ expiresAt: { $lt: new Date() } });
  } catch (error) {
    console.error("Error cleaning up expired SSO tokens:", error);
  }
};

// Run cleanup every 5 minutes
setInterval(cleanupExpiredTokens, 5 * 60 * 1000);

exports.generateSSOToken = async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.user || !req.user._id) {
      return res.status(401).json({ msg: "Authentication required" });
    }

    const userId = req.user._id;

    // Check rate limit
    if (!checkRateLimit(userId)) {
      return res.status(429).json({ 
        msg: "Rate limit exceeded. Maximum 5 tokens per minute." 
      });
    }

    // Generate secure token
    const tokenBytes = crypto.randomBytes(32);
    const token = tokenBytes.toString("hex");
    
    // Hash the token for storage (similar to password hashing)
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // Set expiration to 30 seconds from now
    const expiresAt = new Date(Date.now() + 30 * 1000);

    // Create SSO token record
    const ssoToken = await SSOToken.create({
      token: tokenHash,
      userId: userId,
      expiresAt: expiresAt,
      used: false,
    });

    // Return the unhashed token to the client
    res.status(200).json({
      success: true,
      token: token,
      expiresAt: expiresAt,
    });

  } catch (error) {
    console.error("Error generating SSO token:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

exports.validateSSOToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ msg: "Token is required" });
    }

    // Hash the provided token to match stored hash
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // Find the token in database
    const ssoToken = await SSOToken.findOne({
      token: tokenHash,
      used: false,
      expiresAt: { $gt: new Date() },
    }).populate("userId", "email name");

    if (!ssoToken) {
      return res.status(400).json({ 
        msg: "Invalid, expired, or already used token" 
      });
    }

    // Mark token as used
    ssoToken.used = true;
    await ssoToken.save();

    // Return user information
    res.status(200).json({
      success: true,
      user: {
        email: ssoToken.userId.email,
        name: ssoToken.userId.name,
      },
    });

  } catch (error) {
    console.error("Error validating SSO token:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};