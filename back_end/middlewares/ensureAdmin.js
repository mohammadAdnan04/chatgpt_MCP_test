// middleware/ensureAdminRole.js
const User = require('../models/User');

// Admin emails from environment variable (existing approach)
const adminEmails = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Enhanced admin check that supports both the email list and role field
 */
module.exports = async function ensureAdminRole(req, res, next) {
  try {
    // Skip check if no authentication
    if (!req.userObj && !req.user && !req.auth) {
      return res.status(401).json({ msg: "Authentication required" });
    }
    
    // Get user from DB if not already loaded
    let userObj = req.userObj;
    if (!userObj) {
      const userId = req.auth?.userId || req.user?.id || req.user?.sub;
      userObj = await User.findById(userId);
      if (!userObj) {
        return res.status(401).json({ msg: "User not found" });
      }
      req.userObj = userObj;
    }
    
    // Method 1: Check email against admin list (legacy approach)
    if (userObj.email && adminEmails.includes(userObj.email.toLowerCase())) {
      return next();
    }
    
    // Method 2: Check role field (new approach)
    if (userObj.role === "admin") {
      return next();
    }
    
    // Not an admin by either method
    return res.status(403).json({ message: 'Forbidden: You do not have admin privileges.' });
  } catch (err) {
    console.error("Admin check error:", err);
    return res.status(500).json({ msg: "Error checking admin status" });
  }
};