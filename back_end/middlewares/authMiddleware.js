const jwt = require("jsonwebtoken");
const User = require("../models/User");
const {clearAuthCookies} = require("../auth/cookies")

exports.isAuthenticated = async (req, res, next) => {
  // Service-to-Service Bypass for the AI Background Worker
  const internalSecret = req.headers['x-internal-service-secret'];
  if (internalSecret && internalSecret === (process.env.INTERNAL_SERVICE_SECRET || 'mawsool_internal_secret_123')) {
    // If it's a trusted internal service, we trust the userId provided in the body
    if (req.body.userId) {
      req.user = { sub: req.body.userId, id: req.body.userId, _id: req.body.userId };
      return next();
    }
  }

  const token = req.cookies?.["auth-token"];
  // console.log(token);
  if (!token) return res.status(401).json({ msg: "No auth cookie" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // console.log(decoded);
    const userId = decoded.sub || decoded.id || decoded._id;
    if (!userId) return res.status(401).json({ msg: "Invalid token payload" });

    const user = await User.findById(userId);
    
    if (!user) {
      clearAuthCookies(res);
      return res.status(401).json({ msg: "User not found" });
    }

    // --- Verification Check ---
    // If the user is not an admin, not using SSO, and not verified, block access to protected routes
    if (user.role !== "admin" && !user.isVerified && !user.googleId && !user.microsoftId) {
      clearAuthCookies(res);
      return res.status(403).json({ 
        msg: "Please verify your email address before accessing this feature.",
        code: "UNVERIFIED_EMAIL"
      });
    }
    // --------------------------

    // --- Single Session Check ---
    // If the token version in the cookie doesn't match the DB, it's an old session.
    if (decoded.v !== undefined && user.tokenVersion !== undefined) {
      if (decoded.v !== user.tokenVersion) {
        clearAuthCookies(res);
        // Return 401 but with a specific code for the frontend to catch
        return res.status(401).json({ 
          msg: "Session expired. You have logged in from another device.",
          code: "SESSION_CONFLICT" 
        });
      }
    }
    // ----------------------------

    // console.log(user, "in the midle");
    req.user = decoded;
    req.user.id = decoded.sub;
    req.userObj = user;
    next();
  } catch (err) {
    clearAuthCookies(res);
    return res.status(401).json({ msg: "Invalid token" });
  }
};