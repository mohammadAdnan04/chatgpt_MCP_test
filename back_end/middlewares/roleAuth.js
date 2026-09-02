// middleware/roleAuth.js
const User = require('../models/User');

/**
 * Middleware to check if user has required system role
 * @param {string|string[]} roles 
 */
exports.requireRole = (roles) => {
  if (!Array.isArray(roles)) {
    roles = [roles];
  }
  
  return async (req, res, next) => {
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
      
      // Check role
      if (roles.includes(userObj.role || "user")) {
        return next();
      } else {
        return res.status(403).json({ msg: "Insufficient permissions" });
      }
    } catch (err) {
      console.error("Role check error:", err);
      return res.status(500).json({ msg: "Error checking permissions" });
    }
  };
};

/**
 * Middleware to check if user has required organization role
 * @param {string|string[]} roles - Organization role(s) to check
 */
exports.requireOrgRole = (roles) => {
  if (!Array.isArray(roles)) {
    roles = [roles];
  }
  
  return async (req, res, next) => {
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
      
      // Check organization role
      if (userObj.orgRole && roles.includes(userObj.orgRole)) {
        return next();
      } else {
        return res.status(403).json({ msg: "Insufficient organization permissions" });
      }
    } catch (err) {
      console.error("Org role check error:", err);
      return res.status(500).json({ msg: "Error checking organization permissions" });
    }
  };
};

/**
 * Hybrid middleware - allows EITHER system admins OR users with specific org roles
 * @param {string|string[]} orgRoles - Organization roles to check
 */
exports.requireAdminOrOrgRole = (orgRoles) => {
  if (!Array.isArray(orgRoles)) {
    orgRoles = [orgRoles];
  }
  
  return async (req, res, next) => {
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
      
      // Check if system admin
      if (userObj.role === "admin") {
        return next();
      }
      
      // Check organization role
      if (userObj.orgRole && orgRoles.includes(userObj.orgRole)) {
        return next();
      } 
      
      // Neither admin nor has org role
      return res.status(403).json({ msg: "Insufficient permissions" });
    } catch (err) {
      console.error("Permission check error:", err);
      return res.status(500).json({ msg: "Error checking permissions" });
    }
  };
};