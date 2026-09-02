const Credit = require("../models/Credit");
const User = require("../models/User");
const Organization = require("../models/Organization");
const { getBalanceForUser, deductCreditsForUser } = require("../utils/wallet");
// Get total balance
exports.getCredits = async (req, res) => {
  const userId = req.user.id || req.user.sub || req.user._id;
  try {
    const user = await User.findById(userId).select("credits");
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }
    const balanceInfo = await getBalanceForUser(userId);
    // balanceInfo contains { balance, personalCredits, poolCredits, scope }
    res.json(balanceInfo);
  } catch (err) {
    console.error("Error fetching credits:", err);
    res.status(500).json({ msg: "Error fetching balance", error: err.message });
  }
};

exports.deductCredits = async (req, res) => {
  const userId = req.user.id; 
  const { amount, description} = req.body;
  try {
    const user = await User.findById(userId).select("credits");
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }
    const deductCredits= await deductCreditsForUser(userId, amount, description);

    res.json({ deductCredits });
  } catch (err) {
    res.status(500).json({ msg: "Error fetching balance", error: err.message });
  }
};


exports.transferCredits = async (req, res) => {
  const userId = req.user.id || req.user.sub || req.user._id; 
  const { amount, direction } = req.body; 
  
  if (!amount || amount <= 0) {
    return res.status(400).json({ msg: "Amount must be greater than zero." });
  }
  
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "User not found" });
    
    if (!user.orgId) {
      return res.status(400).json({ msg: "You do not belong to a team." });
    }
    
    const org = await Organization.findById(user.orgId);
    if (!org) return res.status(404).json({ msg: "Organization not found" });
    
    const parsedAmount = parseInt(amount, 10);
    
    if (direction === "personal_to_team") {
      if ((user.credits || 0) < parsedAmount) {
        return res.status(400).json({ msg: "Insufficient personal credits." });
      }
      
      user.credits -= parsedAmount;
      org.poolCredits = (org.poolCredits || 0) + parsedAmount;
      
      await user.save();
      await org.save();
      
      await Credit.create({ 
        userId: user._id, 
        amount: parsedAmount, 
        type: "transfer", 
        description: "Transferred from Personal to Team Pool",
        balance: user.credits
      });
      
    } else if (direction === "team_to_personal") {
      if (String(org.ownerId) !== String(user._id)) {
        return res.status(403).json({ msg: "Only the team owner can transfer credits from the team pool." });
      }
      
      if ((org.poolCredits || 0) < parsedAmount) {
        return res.status(400).json({ msg: "Insufficient team pool credits." });
      }
      
      org.poolCredits -= parsedAmount;
      user.credits = (user.credits || 0) + parsedAmount;
      
      await org.save();
      await user.save();
      
      await Credit.create({ 
        userId: user._id, 
        amount: parsedAmount, 
        type: "transfer", 
        description: "Transferred from Team Pool to Personal",
        balance: user.credits
      });
    } else {
      return res.status(400).json({ msg: "Invalid transfer direction." });
    }
    
    const balanceInfo = await getBalanceForUser(userId);
    res.json({ msg: "Transfer successful", ...balanceInfo });
    
  } catch (err) {
    console.error("Error transferring credits:", err);
    res.status(500).json({ msg: "Error transferring credits", error: err.message });
  }
};

// View credit history
exports.getCreditHistory = async (req, res) => {
  const userId = req.user.sub || req.user.id || req.user._id;
  try {
    const history = await Credit.find({ userId }).sort({ createdAt: -1 });
    res.json({ history });
  } catch (err) {
    res.status(500).json({ msg: "Error fetching history", error: err.message });
  }
};
