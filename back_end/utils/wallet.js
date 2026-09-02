// utils/wallet.js
const User = require("../models/User");
const Organization = require("../models/Organization");
const Credit = require("../models/Credit");

async function resolveWallet(userId) {
  const user = await User.findById(userId).populate('orgId');
  if (!user) throw new Error("User not found");
  
  if (user.orgId) {
    // Determine the org member record
    const memberRecord = user.orgId.members.find(m => m.userId.toString() === user._id.toString());
    return { scope: "org", user, org: user.orgId, memberRecord };
  }
  
  return { scope: "user", user, org: null, memberRecord: null };
}

async function addCreditsForUser(userId, amount, description = "credit grant") {
  if (amount <= 0) throw new Error("Amount must be positive");
  const { scope, user, org } = await resolveWallet(userId);
  
  if (scope === "org") {
    // Add to org pool
    org.poolCredits += amount;
    await org.save();
    await Credit.create({ userId: user._id, organizationId: org._id, amount, type: "buy", description: `[ORG] ${description}`, balance: org.poolCredits });
    return { scope: "org", balance: org.poolCredits };
  } else {
    // Add to personal pool
    user.credits += amount;
    await user.save();
    await Credit.create({ userId: user._id, amount, type: "buy", description, balance: user.credits });
    return { scope: "user", balance: user.credits };
  }
}

async function deductCreditsForUser(userId, amount, description = "credit deduct") {
  if (amount <= 0) throw new Error("Amount must be positive");
  const { scope, user, org, memberRecord } = await resolveWallet(userId);

  if (scope === "org") {
    // First, check if there are enough pool credits AND if the user hasn't hit their org limit
    let canUsePool = false;
    if (org.poolCredits >= amount) {
      if (memberRecord && memberRecord.orgCreditLimit !== null) {
        if ((memberRecord.orgCreditsUsed + amount) <= memberRecord.orgCreditLimit) {
          canUsePool = true;
        }
      } else {
        canUsePool = true;
      }
    }

    if (canUsePool) {
      // Attempt to deduct from org pool atomically
      const updateResult = await Organization.findOneAndUpdate(
        { _id: org._id, poolCredits: { $gte: amount } },
        { $inc: { poolCredits: -amount } },
        { new: true }
      );

      if (updateResult) {
        // Update user's used amount atomically
        await Organization.findOneAndUpdate(
          { _id: org._id, "members.userId": user._id },
          { $inc: { "members.$.orgCreditsUsed": amount } }
        );

        await Credit.create({ 
          userId: user._id, 
          organizationId: org._id,
          amount, 
          type: "deduct", 
          description: `[ORG] ${description}`,
          balance: updateResult.poolCredits
        });

        return { scope: "org", balance: updateResult.poolCredits };
      }
    }
    
    // FALLBACK: If org pool is empty or user hit their limit, try to deduct from their PERSONAL wallet
    const personalUpdateResult = await User.findOneAndUpdate(
      { _id: user._id, credits: { $gte: amount } },
      { $inc: { credits: -amount } },
      { new: true }
    );

    if (personalUpdateResult) {
      await Credit.create({ 
        userId: user._id, 
        amount, 
        type: "deduct", 
        description: `[PERSONAL FALLBACK] ${description}`,
        balance: personalUpdateResult.credits
      });
      return { scope: "user", balance: personalUpdateResult.credits };
    }

    // If both failed
    throw new Error(`Insufficient credits (Both Team Pool and Personal Account are empty)`);
    
  } else {
    // Solo user personal deduction
    const updateResult = await User.findOneAndUpdate(
      { _id: user._id, credits: { $gte: amount } },
      { $inc: { credits: -amount } },
      { new: true }
    );

    if (!updateResult) {
      throw new Error(`Insufficient user credits`);
    }

    await Credit.create({ 
      userId: user._id, 
      amount, 
      type: "deduct", 
      description: description,
      balance: updateResult.credits
    });

    return { scope: "user", balance: updateResult.credits };
  }
}

async function getInFlightCredits(userId) {
  const List = require("../models/List");
  const runningLists = await List.find({ createdBy: userId, revealStatus: 'running' }).lean();
  let inFlight = 0;
  for (const list of runningLists) {
    if (list.revealProgress && list.revealProgress.total > 0) {
      const remaining = Math.max(0, list.revealProgress.total - (list.revealProgress.current || 0));
      const type = list.revealProgress.type;
      let costPerLead = 0;
      if (type === 'email') costPerLead = 5;
      else if (type === 'phone') costPerLead = 20;
      else if (type === 'both') costPerLead = 25;
      inFlight += remaining * costPerLead;
    }
  }
  return inFlight;
}

async function getBalanceForUser(userId) {
  const { scope, user, org, memberRecord } = await resolveWallet(userId);
  const inFlightCredits = await getInFlightCredits(userId);

  if (scope === "org") {
    let availableInPool = org.poolCredits;
    let poolBalance = availableInPool;
    const hasLimit = memberRecord && memberRecord.orgCreditLimit !== null && memberRecord.orgCreditLimit !== undefined;

    if (hasLimit) {
      let availableForUser = memberRecord.orgCreditLimit - memberRecord.orgCreditsUsed;
      poolBalance = Math.max(0, Math.min(availableInPool, availableForUser));
    }

    // If this member has a credit limit, expose only their allocation —
    // not the full org pool — so their UI shows what they can actually use.
    const visiblePoolCredits = hasLimit ? memberRecord.orgCreditLimit : org.poolCredits;

    return {
      balance: poolBalance,              // Effective spendable credits right now
      personalCredits: user.credits,
      poolCredits: visiblePoolCredits,   // What this user sees as "their" team pool
      memberCreditLimit: hasLimit ? memberRecord.orgCreditLimit : null,
      memberCreditsUsed: hasLimit ? memberRecord.orgCreditsUsed : null,
      scope: "org",
      memberCount: org.members.length,
      inFlightCredits
    };
  }
  
  return {
    balance: user.credits,
    personalCredits: user.credits,
    poolCredits: 0,
    memberCreditLimit: null,
    memberCreditsUsed: null,
    scope: "user",
    memberCount: 0,
    inFlightCredits
  };
}

module.exports = { addCreditsForUser, deductCreditsForUser, getBalanceForUser, resolveWallet };
