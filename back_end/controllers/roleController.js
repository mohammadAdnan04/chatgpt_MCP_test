// controllers/roleController.js
const User = require('../models/User');

exports.listAdmins = async (req, res) => {
  try {
    const admins = await User.find({ role: 'admin' })
      .select('name email avatar createdAt')
      .lean();
    
    return res.json({ admins });
  } catch (err) {
    console.error("Error listing admins:", err);
    return res.status(500).json({ msg: "Error retrieving admin list" });
  }
};

/**
 * Promote a user to admin role
 */
exports.promoteToAdmin = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }
    
    // Already an admin
    if (user.role === 'admin') {
      return res.status(400).json({ msg: "User is already an admin" });
    }
    
    user.role = 'admin';
    await user.save();
    
    return res.json({ 
      msg: "User promoted to admin successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    console.error("Error promoting user:", err);
    return res.status(500).json({ msg: "Error promoting user to admin" });
  }
};

/**
 * Demote a user from admin role
 */
exports.demoteFromAdmin = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Prevent admin from demoting themselves
    if (userId === req.userObj._id.toString()) {
      return res.status(400).json({ msg: "Cannot demote yourself from admin" });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }
    
    // Not an admin
    if (user.role !== 'admin') {
      return res.status(400).json({ msg: "User is not an admin" });
    }
    
    user.role = 'user';
    await user.save();
    
    return res.json({ 
      msg: "User demoted from admin successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    console.error("Error demoting user:", err);
    return res.status(500).json({ msg: "Error demoting user from admin" });
  }
};