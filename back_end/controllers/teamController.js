const Organization = require("../models/Organization");
const User = require("../models/User");
const planConfig = require("../config/planConfig");
const {getBalanceForUser } = require("../utils/wallet");
const sendEmail = require("../utils/sendEmail");

// GET /api/team/members
exports.getMembers = async (req, res) => {
  const user = req.userObj;
  if (!user.orgId) return res.status(400).json({ msg: "Your current plan does not include adding additional users. Please <b><a class='url_link' href='/setting/planOverview'>upgrade plan</a></b> to continue." });

  // Populate userId with required fields
  const org = await Organization.findById(user.orgId)
    .populate("members.userId", "name email avatar");

  // Map members with balance
  const members = await Promise.all(
    org.members.map(async (m) => {
      const userId = m.userId?._id || m.userId;
      const balance = userId ? await getBalanceForUser(userId) : 0;

      return {
        id: userId,
        name: m.userId?.name,
        email: m.userId?.email,
        avatar: m.userId?.avatar,
        role: m.role,
        balance,
        orgCreditLimit: m.orgCreditLimit,
        orgCreditsUsed: m.orgCreditsUsed,
      };
    })
  );

  res.json({
    seatsAllowed: org.seatsAllowed,
    poolCredits: org.poolCredits,
    members,
    planKey: org.planKey,
    maxExtraUsers: org.planKey && planConfig[org.planKey] ? planConfig[org.planKey].maxExtraUsers : 0,
  });
};

// POST /api/team/add  { email, role }
exports.addMember = async (req, res) => {
  const user = req.userObj;
  const { email, role = "member" } = req.body;

  if (!user.orgId) return res.status(400).json({ msg: "Your current plan does not include adding additional users. Please upgrade to a higher plan to continue." });

  const org = await Organization.findById(user.orgId);
  if (!org) return res.status(400).json({ msg: "Org not found" });

  // Only owner/admin can add
  if (!["owner","admin"].includes(user.orgRole)) {
    return res.status(403).json({ msg: "Only owner/admin can add members" });
  }

  // The org.seatsAllowed represents the TOTAL number of seats (including owner).
  let maxAllowedInArray = org.seatsAllowed || 1;

  if (org.members.length >= maxAllowedInArray) {
    return res.status(400).json({ msg: `Seat limit reached (Max: ${maxAllowedInArray} total users). Upgrade plan or buy more seats to add more users.` });
  }

  const memberUser = await User.findOne({ email });
  if (!memberUser) return res.status(403).json({ msg: "User not found. Ask them to sign up first." });

  // Already in another org?
  if (memberUser.orgId && String(memberUser.orgId) !== String(org._id)) {
    return res.status(403).json({ msg: "User already belongs to another organization" });
  }

  if (memberUser.orgId && String(memberUser.orgId) === String(org._id)) {
    return res.status(403).json({ msg: "User already belongs to this organization" });
  }

  // Add to org
  if (!org.members.find(m => String(m.userId) === String(memberUser._id))) {
    org.members.push({ userId: memberUser._id, role });
    await org.save();
  }

  memberUser.orgId = org._id;
  memberUser.orgRole = role;
  await memberUser.save();

  try {
    await sendEmail({
      to: memberUser.email,
      subject: "Add User to Organization",
      html: `
        <p>Hi ${memberUser.name},</p>
        <p>${user.name} has added you to his users list. Now log in to your own account you can use the same plan that ${user.name} has, and its credits will be available in your account.</p>
      `,
    });
  } catch (emailError) {
    console.error("Failed to send verification email:", emailError);
    // DO NOT return a 403 error here. The user was already successfully added to the DB.
    // Just log the error and continue to the success response.
  }

  res.json({ msg: "Member added successfully", member: { id: memberUser._id, email: memberUser.email, role } });
};

// PUT /api/team/member/:id/role  { role }
exports.updateRole = async (req, res) => {
  const user = req.userObj;
  const { role } = req.body;
  const memberId = req.params.id;

  if (!user.orgId) return res.status(400).json({ msg: "Please buy a plan first, then you can add users." });
  if (!["owner","admin"].includes(user.orgRole)) {
    return res.status(403).json({ msg: "Only owner/admin can change roles" });
  }

  const org = await Organization.findById(user.orgId);
  const member = org.members.find(m => String(m.userId) === String(memberId));
  if (!member) return res.status(404).json({ msg: "Member not found" });

  if (member.role === "owner") return res.status(400).json({ msg: "Owner role cannot be changed" });

  member.role = role;
  await org.save();

  const u = await User.findById(memberId);
  if (u) { u.orgRole = role; await u.save(); }

  res.json({ msg: "Role updated" });
};

// PUT /api/team/member/:id/limit  { limit }
exports.updateLimit = async (req, res) => {
  const user = req.userObj;
  const { limit } = req.body;
  const memberId = req.params.id;

  if (!user.orgId) return res.status(400).json({ msg: "Organization not found." });
  if (!["owner","admin"].includes(user.orgRole)) {
    return res.status(403).json({ msg: "Only owner/admin can set limits." });
  }

  const org = await Organization.findById(user.orgId);
  const member = org.members.find(m => String(m.userId) === String(memberId));
  if (!member) return res.status(404).json({ msg: "Member not found in organization." });

  // limit can be a number, or null to remove the limit
  member.orgCreditLimit = (limit === null || limit === "") ? null : Number(limit);
  await org.save();

  res.json({ msg: "Limit updated successfully", limit: member.orgCreditLimit });
};

// DELETE /api/team/member/:id
exports.removeMember = async (req, res) => {
  const user = req.userObj;
  const memberId = req.params.id;

  if (!user.orgId) return res.status(400).json({ msg: "Please buy a plan first, then you can add users." });
  if (!["owner","admin"].includes(user.orgRole)) {
    return res.status(403).json({ msg: "Only owner/admin can remove members" });
  }

  const org = await Organization.findById(user.orgId);
  const member = org.members.find(m => String(m.userId) === String(memberId));
  if (!member) return res.status(404).json({ msg: "Member not found" });
  if (member.role === "owner") return res.status(400).json({ msg: "Cannot remove owner" });

  org.members = org.members.filter(m => String(m.userId) !== String(memberId));
  await org.save();

  const u = await User.findById(memberId);
  if (u) { u.orgId = null; u.orgRole = null; await u.save(); }

  res.json({ msg: "Member removed" });
};
