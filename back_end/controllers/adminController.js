const User = require("../models/User");
const Organization = require("../models/Organization");
const KnownField = require("../models/KnownField");
const Stripe = require("stripe");
const AiQuery = require("../models/AiQuery");
const List = require("../models/List");
const ListItem = require("../models/ListItem");
const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");
const os = require("os");
const path = require("path");
const RevealedContact = require("../models/RevealedContact");
const sendEmail = require("../utils/sendEmail");
const mongoose = require('mongoose');
const Credit = require("../models/Credit");
const BulkRevealJobReport = require("../models/BulkRevealJobReport");
const ApiUsage = require("../models/ApiUsage");
const axios = require("axios");
const {
  fireAndForgetSignupSync,
  isInternalConfigured,
  pushUserToInternalPipedrive,
} = require("../services/pipedriveService");
const {
  isLikelyCorporatePhone,
  csvColumnLooksCorporate,
  reclassifyRawPhoneFields,
} = require("../utils/revealBilling");

exports.getApiUsageStats = async (req, res) => {
  try {
    const { date } = req.query;
    // Default to today if no date provided
    const targetDate = date || new Date().toISOString().split('T')[0];

    const stats = await ApiUsage.find({ date: targetDate }).sort({ successCount: -1 });
    
    // Calculate totals
    const totalPeopleSearch = stats.filter(s => s.service === 'ContactOut_People_Search').reduce((acc, curr) => acc + curr.successCount, 0);
    const totalCompanySearch = stats.filter(s => s.service === 'ContactOut_Company_Search').reduce((acc, curr) => acc + curr.successCount, 0);

    res.status(200).json({
      date: targetDate,
      totalPeopleSearch,
      totalCompanySearch,
      totalCombined: totalPeopleSearch + totalCompanySearch,
      details: stats
    });
  } catch (error) {
    console.error("Error fetching API Usage stats:", error);
    res.status(500).json({ message: "Failed to fetch API Usage stats." });
  }
};
const { getBalanceForUser, deductCreditsForUser } = require('../utils/wallet');
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

function sanitizePhoneInput(v) {
  return String(v || "").replace(/^'+/, "").trim();
}

function normalizeUrl(u) {
  try {
    if (!u) return "";
    const url = new URL(String(u).trim());
    url.hash = "";
    url.search = "";
    const host = url.hostname.toLowerCase();
    const proto = url.protocol.toLowerCase();
    const path = url.pathname.toLowerCase().replace(/\/+$/,"/");
    return `${proto}//${host}${path}`;
  } catch {
    return String(u || "").trim().toLowerCase();
  }
}

const bcrypt = require("bcryptjs");
const planConfig = require("../config/planConfig");

exports.addUserDirectly = async (req, res) => {
  try {
    const { name, email, password, role, credits, planKey } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ message: "User already exists with this email" });
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hash,
      role: role || "user",
      credits: credits || 0,
      planKey: planKey || "FREE",
      isVerified: true,
      onboarded: true,
      avatar: `${process.env.DEFAULT_AVATAR || 'https://ui-avatars.com/api/?name='}${encodeURIComponent(name)}`,
    });

    // Create default Organization for the new user
    // We can set a fake next billing date (e.g. 1 month from now) so the UI doesn't show 1970
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    const org = await Organization.create({
      name: `${user.name}'s Organization`,
      ownerId: user._id,
      members: [{ userId: user._id, role: "owner" }],
      planKey: planKey || "FREE",
      seatsAllowed: 1,
      currentPeriodEnd: nextMonth // Fix for "Jan 1, 1970" issue
    });

    user.orgId = org._id;
    user.orgRole = "owner";
    await user.save();

    fireAndForgetSignupSync(user);

    res.status(201).json({ message: "User created successfully", user });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ message: "Failed to create user", error: error.message });
  }
};

exports.listUsers = async (req, res, next) => {
  try {
    const isArchived = req.query.archived === 'true';
    console.log("LIST USERS API HIT. isArchived query:", req.query.archived, "parsed as:", isArchived);
    
    const users = await User.find({ isArchived: isArchived ? true : { $ne: true } })
      .select("-pipedrive.accessToken -pipedrive.refreshToken")
      .populate({ path: "orgId", select: "name planKey poolCredits seatsAllowed ownerId" })
      .sort({ createdAt: -1 })
      .lean();
    console.log(`Returning ${users.length} users`);
    res.status(200).json({ users });
  } catch (err) {
    next(err);
  }
};

exports.getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-pipedrive.accessToken -pipedrive.refreshToken")
      .populate({
        path: "orgId",
        populate: { path: "members.userId", select: "name email" },
      })
      .lean();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Attach maxExtraUsers from planConfig so admin panel shows accurate limit
    if (user.orgId && user.orgId.planKey) {
      user.orgId.maxExtraUsers = planConfig[user.orgId.planKey]?.maxExtraUsers || 0;
    } else if (user.orgId) {
      user.orgId.maxExtraUsers = 0;
    }

    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
};

exports.getInvoicesForUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .populate("orgId", "stripeCustomerId name")
      .lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!stripe)
      return res
        .status(500)
        .json({ message: "Stripe service is not configured on the server." });

    if (!user.orgId || !user.orgId.stripeCustomerId) {
      return res
        .status(200)
        .json({
          message:
            "This user's organization is not linked to a Stripe customer.",
          invoices: [],
        });
    }

    const stripeResponse = await stripe.invoices.list({
      customer: user.orgId.stripeCustomerId,
      limit: 20,
    });
    res.status(200).json({ invoices: stripeResponse.data || [] });
  } catch (err) {
    next(err);
  }
};

exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    // Optional: Also remove the user from their organization's member list
    if (user.orgId) {
      await Organization.updateOne(
        { _id: user.orgId },
        { $pull: { members: { userId: user._id } } }
      );
    }
    res.status(204).send(); // Success, no content to return
  } catch (err) {
    next(err);
  }
};

exports.toggleArchiveUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    user.isArchived = !user.isArchived;
    await user.save();
    res.status(200).json({ message: "User archive status updated", isArchived: user.isArchived });
  } catch (err) {
    next(err);
  }
};

exports.bulkArchiveUsers = async (req, res, next) => {
  try {
    const { userIds, archiveStatus } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: "No user IDs provided" });
    }

    // Update multiple users at once
    const result = await User.updateMany(
      { _id: { $in: userIds } },
      { $set: { isArchived: archiveStatus } }
    );

    res.status(200).json({
      message: `Successfully updated ${result.modifiedCount} users`,
      modifiedCount: result.modifiedCount
    });
  } catch (err) {
    next(err);
  }
};

// --- 1. Get List of Pending Queries ---
exports.getPendingQueries = async (req, res) => {
  try {
    const pendingQueries = await AiQuery.find({
      status: { $in: ["pending", "in_progress"] },
    })
      .populate("userId", "name")
      .populate("listId", "name listType")
      .sort({ createdAt: -1 });

    const formattedData = pendingQueries.map((query) => ({
      queryId: query._id,
      userName: query.userId ? query.userId.name : "Unknown User",
      listName: query.listId ? query.listId.name : "Untitled List",
      listType: query.listId ? query.listId.listType : "people",
      totalUsers: query.numLeads,
      status: query.status,
      createdAt: query.createdAt,
    }));
    res.json(formattedData);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch pending queries." });
  }
};

exports.getSingleQueryDetails = async (req, res) => {
  try {
    const { queryId } = req.params;

    const query = await AiQuery.findById(queryId)
      .populate("userId", "name email")
      .populate("listId", "name listType");

    if (!query) {
      return res.status(404).json({ message: "Query not found." });
    }

    const leads = await ListItem.find({ listId: query.listId });

    // Format searchFilter to convert excludeListIds to real list names for the admin dashboard
    let processedSearchFilter = query.searchFilter ? JSON.parse(JSON.stringify(query.searchFilter)) : {};
    
    if (processedSearchFilter.excludeListIds && processedSearchFilter.excludeListIds.length > 0) {
      // Fetch the actual names of the excluded lists from the database
      const excludedLists = await List.find({ _id: { $in: processedSearchFilter.excludeListIds } }, 'name');
      
      const excludeNames = excludedLists.map(l => l.name);
      const includeLabels = {};
      // Create a map where key = name, value = name (this satisfies the frontend's includeLabels logic)
      excludeNames.forEach(name => includeLabels[name] = name);
      
      // Add it as a new formatted category that the frontend FiltersTable will understand
      processedSearchFilter["Excluded Lists"] = {
        include: excludeNames,
        includeLabels: includeLabels
      };
      
      // Remove the raw IDs array so it doesn't render
      delete processedSearchFilter.excludeListIds;
    }

    res.json({
      query: {
        id: query._id,
        prompt: query.prompt,
        status: query.status,
        userName: query.userId.name,
        listName: query.listId.name,
        listType: query.listId.listType || "people",
        includePhone: query.includePhone,
        numLeads: query.numLeads,

        // ADD THESE TWO LINES
        searchFilter: processedSearchFilter, // Send the formatted filter object
        includeLabels: processedSearchFilter?.includeLabels || {}, // The human-readable labels
      },
      leads: leads,
      totalResults: leads.length,
    });
  } catch (error) {
    console.error("Error fetching query details:", error);
    res.status(500).json({ message: "Failed to fetch query details." });
  }
};

exports.getKnownFields = async (req, res) => {
  try {
    const fields = await KnownField.find().sort({ name: 1 });
    res.json(fields.map(f => f.name));
  } catch (error) {
    console.error("Error fetching known fields:", error);
    res.status(500).json({ message: "Failed to fetch known fields." });
  }
};

const toSnake = (s) =>
  String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");
exports.uploadLeadsCSV = [
  multer({
    dest: os.tmpdir(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  }).single("leadsFile"),
  async (req, res) => {
    console.log("[CSV Upload] Received upload request:", req.file && req.file.originalname, "body keys:", Object.keys(req.body || {}));
    if (!req.file) {
      return res.status(400).json({ message: "No CSV file was uploaded." });
    }

    const { queryId } = req.params;
    const csvPath = req.file.path;
    let mappings = {};

    try {
      mappings = req.body.mappings ? JSON.parse(req.body.mappings) : {};
      console.log("[CSV Upload] Parsed mappings keys:", Object.keys(mappings));
      console.log("[CSV Upload] Mappings:", JSON.stringify(mappings));
    } catch (e) {
      if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
      return res.status(400).json({ message: "Invalid mappings JSON." });
    }

    try {
      const query = await AiQuery.findById(queryId)
        .populate("userId", "email name")
        .populate("listId", "name listType");
      if (!query || !query.listId || !query.userId) {
        if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
        return res.status(404).json({ message: "Query, associated list, or user not found" });
      }

      const isCompanies = query.listId.listType === "companies";

      // Require at least first_name & last_name for people, or company for companies
      if (isCompanies) {
        if (!Object.values(mappings).includes("company") && !Object.values(mappings).includes("name")) {
          if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
          return res.status(400).json({ message: "A 'company' or 'name' must be mapped to a CSV column for company lists." });
        }
      } else {
        if (!(Object.values(mappings).includes("first_name") && Object.values(mappings).includes("last_name"))) {
          if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
          return res.status(400).json({ message: "Both 'first_name' and 'last_name' must be mapped to a CSV column." });
        }
      }

      const listId = query.listId._id;
      const user = query.userId;
      const listName = query.listId.name;
      console.log("[CSV Upload] Query info:", { queryId, listId: String(listId), listName, userId: String(user._id), userEmail: user.email, isCompanies });

      // Credits
      let balanceInfo;
      let availableCredits = 0;
      try {
        balanceInfo = await getBalanceForUser(user._id.toString());
        availableCredits = balanceInfo.scope === 'org' 
          ? Math.max(balanceInfo.balance, balanceInfo.personalCredits) 
          : balanceInfo.balance;
      } catch (creditError) {
        console.error("Error checking user credits:", creditError);
        if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
        return res.status(500).json({ message: "Failed to check user credits." });
      }
      console.log("[CSV Upload] Available credits:", availableCredits);

      const leadsFromCsv = [];
      const processedKeys = new Set();
      fs.createReadStream(csvPath)
        .pipe(csv({ 
          mapHeaders: ({ header }) => {
            // Normalize headers: remove BOM and trim, but KEEP casing to preserve original keys
            return (header || "").replace(/^\uFEFF/, '').trim(); 
          }
        }))
        .on("data", (row) => leadsFromCsv.push(row))
        .on("end", async () => {
          try {
            if (leadsFromCsv.length === 0) {
              fs.unlinkSync(csvPath);
              return res.status(400).json({ message: "CSV is empty or could not be parsed." });
            }
            console.log("[CSV Upload] Parsed rows:", leadsFromCsv.length);

            // --- PRE-FETCH REVEAL STATUS START ---
            // 1. Collect all potential public_identifiers to batch query RevealedContact
            const potentialPublicIds = new Set();
            
            // Helper to derive public identifier (reused logic)
            const derivePublicId = (row) => {
               let pid = "";
               // Try explicit mapping
               const pidKey = Object.keys(mappings).find(k => mappings[k] === "public_identifier");
               if (pidKey && row[pidKey]) pid = row[pidKey];
               
               // Try URL mapping
               if (!pid) {
                  const urlKey = Object.keys(mappings).find(k => 
                      ["linkedin_url", "public_profile_url", "profile_url"].includes(mappings[k])
                  );
                  if (urlKey && row[urlKey]) {
                      let seg = row[urlKey].trim();
                      try {
                          const u = new URL(seg.startsWith('http') ? seg : `https://${seg.replace(/^\/*/, '')}`);
                          const parts = u.pathname.split('/').filter(Boolean);
                          seg = parts.pop() || parts.pop() || '';
                      } catch {
                          const parts = seg.split('/').filter(Boolean);
                          seg = parts.pop() || '';
                      }
                      if (seg) pid = seg;
                  }
               }
               return pid ? pid.trim() : "";
            };

            for (const row of leadsFromCsv) {
                const pid = derivePublicId(row);
                if (pid) potentialPublicIds.add(pid);
            }
            console.log("[CSV Upload] Potential public IDs to prefetch:", potentialPublicIds.size);

            // 2. Batch query
            const revealedMap = {}; // { publicId: { phone: bool, email: bool } }
            if (potentialPublicIds.size > 0) {
                const existingReveals = await RevealedContact.find({
                    userId: user._id,
                    publicIdentifier: { $in: Array.from(potentialPublicIds) }
                }).select('publicIdentifier contactType').lean();
                
                for (const rev of existingReveals) {
                    if (!rev.publicIdentifier) continue;
                    if (!revealedMap[rev.publicIdentifier]) revealedMap[rev.publicIdentifier] = {};
                    revealedMap[rev.publicIdentifier][rev.contactType] = true;
                }
                console.log("[CSV Upload] Prefetched reveals:", existingReveals.length);
            }
            // --- PRE-FETCH REVEAL STATUS END ---

            // --- ENSURE HIDDEN CACHE LIST EXISTS ---
            let hiddenListId = null;
            try {
              const HIDDEN_NAME = '__mawsool_hidden_global_cache__';
              let hList = await List.findOne({ createdBy: user._id, name: HIDDEN_NAME });
              if (!hList) {
                hList = await List.create({ name: HIDDEN_NAME, createdBy: user._id, status: 'active' });
                // Try to set kind to user_made (default) or something safe
                const ListKind = require('../models/ListKind');
                try { await ListKind.updateOne({ listId: hList._id }, { $set: { kind: 'user_made' } }, { upsert: true }); } catch {}
              }
              hiddenListId = hList._id;
              console.log("[CSV Upload] Hidden cache list ID:", String(hiddenListId));
            } catch (hErr) {
              console.error("Failed to ensure hidden cache list:", hErr);
            }

            let updatedCount = 0;
            let insertedCount = 0;
            let notFoundNames = [];
            let phoneNumbersFound = 0;
            let emailsFound = 0;
            let companiesFound = 0;

            const PHONE_CREDIT_COST = 20;
            const EMAIL_CREDIT_COST = 5;
            const COMPANY_CREDIT_COST = 1;
            const revealedContacts = [];
            let remainingCredits = availableCredits;

            const phoneColumn = Object.keys(mappings).find((key) => mappings[key] === "phone");
            const emailColumn = Object.keys(mappings).find((key) => mappings[key] === "email");
            const emailStatusColumn = Object.keys(mappings).find((key) => mappings[key] === "email_status");
            const csvProvidesPersonalMobile = !!(
              phoneColumn &&
              !csvColumnLooksCorporate(phoneColumn) &&
              leadsFromCsv.some((row) =>
                String(row[phoneColumn] || "")
                  .split(",")
                  .some((p) => p.trim() && !isLikelyCorporatePhone(p))
              )
            );

            // MAIN LOOP: map + fallback + upsert
            let __rowNum = 0;
            for (const row of leadsFromCsv) {
              __rowNum++;
              const mappedData = { listId, raw: {} };

              // 1) Apply explicit mappings
              for (const [csvCol, dbField] of Object.entries(mappings)) {
                const val = row[csvCol];
                if (!dbField || val == null || val === "") continue;

                if (dbField === "industry" && typeof val === "string") {
                  mappedData.raw[dbField] = val
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean);
                } else if (dbField === "current_positions" && typeof val === "string") {
                  try {
                    const parsed = JSON.parse(val);
                    mappedData.raw[dbField] = Array.isArray(parsed) ? parsed : [parsed];
                  } catch {
                    mappedData.raw[dbField] = [{ role: val }];
                  }
                } else {
                  mappedData.raw[dbField] = val;
                }
              }

              // 2) Fallback: store EVERY other CSV column using snake_case key
              for (const [csvCol, rawVal] of Object.entries(row)) {
                if (rawVal == null || rawVal === "") continue;
                const mappedKey = mappings[csvCol];
                if (!mappedKey) {
                  const fallbackKey = toSnake(csvCol);
                  if (mappedData.raw[fallbackKey] == null) {
                    mappedData.raw[fallbackKey] = rawVal;
                  }
                }
              }

              // 2.5) Preserve original headers and row values verbatim for UI/export parity
              mappedData.raw.__headers = Object.keys(row);
              mappedData.raw.__original = { ...row };
              reclassifyRawPhoneFields(mappedData.raw);

              // 2.6) Derive public_identifier from linkedin_url when missing
              if (!mappedData.raw.public_identifier) {
                const ln = mappedData.raw.linkedin_url || mappedData.raw.public_profile_url || mappedData.raw.profile_url;
                if (typeof ln === 'string' && ln.trim()) {
                  let seg = ln.trim();
                  try {
                    const u = new URL(seg.startsWith('http') ? seg : `https://${seg.replace(/^\/*/, '')}`);
                    const parts = u.pathname.split('/').filter(Boolean);
                    seg = parts.pop() || parts.pop() || '';
                  } catch {
                    const parts = seg.split('/').filter(Boolean);
                    seg = parts.pop() || '';
                  }
                  if (seg) mappedData.raw.public_identifier = seg;
                }
              }

              // 3) Build name if not present
              if (!mappedData.raw.name && mappedData.raw.first_name && mappedData.raw.last_name) {
                mappedData.raw.name = `${mappedData.raw.first_name} ${mappedData.raw.last_name}`.trim();
              }
              
              if (isCompanies) {
                if (!mappedData.raw.name && mappedData.raw.company) mappedData.raw.name = mappedData.raw.company;
                if (!mappedData.raw.company && mappedData.raw.name) mappedData.raw.company = mappedData.raw.name;
              }

              const publicId = (mappedData.raw.public_identifier || "").trim();
              const lnUrl = (mappedData.raw.linkedin_url || "").trim();
              const emailVal = (mappedData.raw.email || "").trim();
              const nameVal = (mappedData.raw.name || "").trim();
              const companyVal = (mappedData.raw.company || (mappedData.raw.current_positions && mappedData.raw.current_positions[0] && mappedData.raw.current_positions[0].company) || "").trim();
              console.log(`[CSV Row ${__rowNum}] Derived identifiers:`, { publicId, lnUrl, emailVal, nameVal, companyVal });
              if (publicId) processedKeys.add(publicId);
              if (lnUrl) processedKeys.add(lnUrl);

              const orClauses = [];
              if (publicId) {
                  orClauses.push({ "raw.public_identifier": publicId });
                  orClauses.push({ "public_identifier": publicId });
              }
              if (lnUrl) {
                  orClauses.push({ "raw.linkedin_url": lnUrl });
                  orClauses.push({ "linkedin_url": lnUrl });
                  // Restore Fuzzy Matching as Backup
                  try {
                      const u = new URL(lnUrl.startsWith('http') ? lnUrl : `https://${lnUrl}`);
                      const path = u.pathname.replace(/\/+$/, ''); 
                      if (path.length > 1) {
                          const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                          const regex = new RegExp(escaped + '/?$', 'i');
                          orClauses.push({ "raw.linkedin_url": regex });
                          orClauses.push({ "linkedin_url": regex });
                          orClauses.push({ "raw.public_profile_url": regex });
                          orClauses.push({ "public_profile_url": regex });
                          orClauses.push({ "raw.profile_url": regex });
                          orClauses.push({ "profile_url": regex });
                      }
                  } catch(e){}
              }
              if (emailVal) {
                  orClauses.push({ "raw.email": emailVal });
                  orClauses.push({ "email": emailVal });
              }
              if (nameVal && companyVal) orClauses.push({ $and: [{ "raw.name": nameVal }, { "raw.company": companyVal }] });
              console.log(`[CSV Row ${__rowNum}] Match query:`, JSON.stringify(orClauses));

              const existingItem = orClauses.length
                ? await ListItem.findOne({ listId, $or: orClauses })
                : null;

              let leadId;
              let isNewInsert = false;
              if (existingItem) {
                Object.assign(existingItem.raw, mappedData.raw);
                existingItem.status = "Verified";
                await existingItem.save();
                updatedCount++;
                leadId = existingItem._id;
                console.log(`[CSV Row ${__rowNum}] Updated existing lead:`, String(leadId));
              } else {
                mappedData.status = "Verified";
                const newItem = await ListItem.create(mappedData);
                insertedCount++;
                leadId = newItem._id;
                isNewInsert = true;
                console.log(`[CSV Row ${__rowNum}] Inserted new lead:`, String(leadId));
              }

              if (isCompanies) {
                // For companies, deduct 1 credit per company added/updated if we have credits
                // The prompt says "deduct 1 credit from the user for every company added to the list"
                // Assuming this means 1 credit per row processed. Let's charge 1 credit if we haven't already.
                // Wait, if it's already in the list, should we charge again? "every company added".
                // Let's charge 1 credit for new inserts only, or maybe every row? "every company added to the list" -> new inserts.
                // Let's just track `companiesAdded` instead of emailsFound/phoneNumbersFound
                if (isNewInsert && remainingCredits >= 1) {
                   companiesFound++; // We need to declare this
                   remainingCredits -= 1;
                }
                continue; // Skip the phone/email checking for companies
              }

              // --- CHECK REVEAL STATUS ---
              let isPhoneRevealed = false;
              let isEmailRevealed = false;

              // Check by Public Identifier
              if (publicId && revealedMap[publicId]) {
                  if (revealedMap[publicId].phone) isPhoneRevealed = true;
                  if (revealedMap[publicId].email) isEmailRevealed = true;
              }

              // Check by normalized Profile URL (covers Search reveal path)
              try {
                const pUrlCandidate = lnUrl || mappedData.raw.public_profile_url || mappedData.raw.profile_url;
                const norm = normalizeUrl(pUrlCandidate);
                if (norm && (!isPhoneRevealed || !isEmailRevealed)) {
                  const viaUrl = await RevealedContact.find({ userId: user._id, profileUrl: norm }).select('contactType');
                  for (const r of viaUrl) {
                    if (r.contactType === 'phone') isPhoneRevealed = true;
                    if (r.contactType === 'email') isEmailRevealed = true;
                  }
                }
              } catch {}

              // Check by Lead ID (if existing item, might be revealed via List view)
              if (existingItem) {
                  // Only query if not already known
                  if (!isPhoneRevealed || !isEmailRevealed) {
                      const leadReveals = await RevealedContact.find({ userId: user._id, leadId: leadId }).select('contactType');
                      for (const r of leadReveals) {
                          if (r.contactType === 'phone') isPhoneRevealed = true;
                          if (r.contactType === 'email') isEmailRevealed = true;
                      }
                  }
              }
              console.log(`[CSV Row ${__rowNum}] Reveal status before charging:`, { isPhoneRevealed, isEmailRevealed });

              // 4) Charge for phone/email if allowed and NOT revealed.
              // HQ / landline / corporate-column numbers must never count as a revealed mobile.
              if (phoneColumn && row[phoneColumn] && String(row[phoneColumn]).trim() && !isPhoneRevealed) {
                const phoneVal = String(row[phoneColumn]).trim();
                const phoneParts = phoneVal.split(',').map(s => s.trim()).filter(Boolean);
                const hasPersonal = !csvColumnLooksCorporate(phoneColumn) && phoneParts.some(p => !isLikelyCorporatePhone(p));
                
                if (hasPersonal && remainingCredits >= PHONE_CREDIT_COST) {
                  phoneNumbersFound++;
                  remainingCredits -= PHONE_CREDIT_COST;
                  revealedContacts.push({
                    userId: user._id,
                    leadId,
                    contactType: "phone",
                    status: "charged",
                    publicIdentifier: publicId || undefined
                  });
                  console.log(`[CSV Row ${__rowNum}] Phone processed:`, { phoneVal, remainingCredits });
                } else {
                  console.log(`[CSV Row ${__rowNum}] Phone skipped (corporate/landline or insufficient credits):`, { phoneVal, hasPersonal });
                }
              }

              if (
                emailColumn &&
                row[emailColumn] &&
                String(row[emailColumn]).trim() &&
                emailStatusColumn &&
                row[emailStatusColumn] &&
                String(row[emailStatusColumn]).trim().toLowerCase() === "verified" &&
                !isEmailRevealed &&
                remainingCredits >= EMAIL_CREDIT_COST
              ) {
                emailsFound++;
                remainingCredits -= EMAIL_CREDIT_COST;
                revealedContacts.push({
                  userId: user._id,
                  leadId,
                  contactType: "email",
                  status: "charged",
                  publicIdentifier: publicId || undefined
                });
                console.log(`[CSV Row ${__rowNum}] Email processed:`, { emailValue: String(row[emailColumn]).trim(), emailStatus: String(row[emailStatusColumn]).trim(), remainingCredits });
              }
            }

            // 5) Sync reveals to other lists AND Hidden Cache
            try {
              if ((phoneColumn && row[phoneColumn]) || (emailColumn && row[emailColumn])) {
                  // A) Sync to Hidden Global Cache
                  if (hiddenListId) {
                      const cacheQuery = [];
                      if (publicId) cacheQuery.push({ "raw.public_identifier": publicId });
                      if (lnUrl) cacheQuery.push({ "raw.linkedin_url": lnUrl });
                      
                      if (cacheQuery.length > 0) {
                         const cacheItem = await ListItem.findOne({ listId: hiddenListId, $or: cacheQuery });
                         if (cacheItem) {
                             // Update Existing
                             let cMod = false;
                             if (phoneColumn && !csvColumnLooksCorporate(phoneColumn) && row[phoneColumn] && String(row[phoneColumn]).trim() && String(row[phoneColumn]).split(',').some(p => p.trim() && !isLikelyCorporatePhone(p))) {
                                 const pVal = String(row[phoneColumn]).trim();
                                 const existP = cacheItem.raw.phone && String(cacheItem.raw.phone).toLowerCase();
                                 if (!cacheItem.raw.phone || existP === 'not available' || existP === 'null' || existP === 'undefined') { 
                                     cacheItem.raw.phone = pVal; 
                                     cMod = true;
                                     const existingPhones = Array.isArray(cacheItem.raw.contact__phone_numbers) ? cacheItem.raw.contact__phone_numbers : [];
                                     const merged = [...existingPhones];
                                     pVal.split(',').map(s=>s.trim()).filter(Boolean).forEach(v => {
                                         const m = v.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
                                         const num = m ? m[1].trim() : v;
                                         const type = m ? m[2].trim() : '';
                                         if (!merged.find(x => (x?.sanitized_number || x?.raw_number) === num)) {
                                             merged.push({ sanitized_number: num, raw_number: num, type });
                                         }
                                     });
                                     cacheItem.raw.contact__phone_numbers = merged;
                                 }
                             }
                             if (emailColumn && row[emailColumn]) {
                                 const eVal = String(row[emailColumn]).trim();
                                 const merged = [];
                                 // Determine global status from CSV if available
                                 let gStatus = 'unknown';
                                 if (emailStatusColumn && row[emailStatusColumn]) {
                                     gStatus = String(row[emailStatusColumn]).trim();
                                 }
                                 
                                 eVal.split(/[;,]+/).map(s=>s.trim()).filter(Boolean).forEach(em => {
                                     merged.push({ email: em, verificationStatus: gStatus });
                                 });
                                 cacheItem.raw.contact__all_emails = merged;
                                 cacheItem.raw.email_status = gStatus;
                                 cMod = true;
                             }

                             if (cMod) {
                                 cacheItem.markModified('raw');
                                 await cacheItem.save();
                                 console.log("[CSV Upload] Hidden cache updated existing item:", String(cacheItem._id));
                             }
                         } else {
                             // Insert New
                             const newRaw = { ...mappedData.raw };
                             if (phoneColumn && !csvColumnLooksCorporate(phoneColumn) && row[phoneColumn] && String(row[phoneColumn]).split(',').some(p => p.trim() && !isLikelyCorporatePhone(p))) newRaw.phone = String(row[phoneColumn]).trim();
                             if (emailColumn && row[emailColumn]) newRaw.email = String(row[emailColumn]).trim();
                             
                             if (newRaw.phone) {
                                 const pVal = newRaw.phone;
                                 const merged = [];
                                 pVal.split(',').map(s=>s.trim()).filter(Boolean).forEach(v => {
                                     const m = v.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
                                     const num = m ? m[1].trim() : v;
                                     const type = m ? m[2].trim() : '';
                                     merged.push({ sanitized_number: num, raw_number: num, type });
                                 });
                                 newRaw.contact__phone_numbers = merged;
                             }
                             if (newRaw.email) {
                                 const eVal = newRaw.email;
                                 const merged = [];
                                 let gStatus = 'unknown';
                                 if (emailStatusColumn && row[emailStatusColumn]) {
                                     gStatus = String(row[emailStatusColumn]).trim();
                                 }
                                 eVal.split(/[;,]+/).map(s=>s.trim()).filter(Boolean).forEach(em => {
                                     merged.push({ email: em, verificationStatus: gStatus });
                                 });
                                 newRaw.contact__all_emails = merged;
                                 newRaw.email_status = gStatus;
                             }

                             await ListItem.create({
                                 listId: hiddenListId,
                                 raw: newRaw,
                                 status: 'Verified',
                                 public_identifier: publicId,
                                 linkedin_url: lnUrl,
                                 email: newRaw.email,
                                 phone: newRaw.phone,
                                 name: newRaw.name
                             });
                             console.log("[CSV Upload] Hidden cache inserted new item for:", { publicId, lnUrl });
                         }
                      }
                  }

                  // B) Sync to other user lists
                  const List = require('../models/List');
                  const userLists = await List.find({ createdBy: user._id }).select('_id').lean();
                  const userListIds = userLists.map(l => l._id);
                  
                  // Debug logging for sync
                  console.log(`[CSV Sync] Processing row for: ${publicId || 'No ID'} / ${lnUrl || 'No URL'}`);
                  console.log(`[CSV Sync] orClauses: ${JSON.stringify(orClauses)}`);

                  const otherItems = await ListItem.find({
                      listId: { $in: userListIds },
                      _id: { $ne: leadId },
                      $or: orClauses
                  });
                  
                  console.log(`[CSV Sync] Found ${otherItems.length} matching items in other lists.`);

                  for (const item of otherItems) {
                      let modified = false;
                      // Sync Phone — never copy HQ/landline/corporate-column numbers into mobile
                      if (phoneColumn && !csvColumnLooksCorporate(phoneColumn) && row[phoneColumn] && String(row[phoneColumn]).trim() && String(row[phoneColumn]).split(',').some(p => p.trim() && !isLikelyCorporatePhone(p))) {
                          const phoneVal = sanitizePhoneInput(row[phoneColumn]);
                          
                          // Check BOTH raw and top-level for "Not available" or missing
                          const rawPhone = item.raw?.phone ? String(item.raw.phone).toLowerCase() : '';
                          const topPhone = item.phone ? String(item.phone).toLowerCase() : '';
                          
                          const isMissing = !rawPhone || rawPhone === 'not available' || rawPhone === 'undefined' || rawPhone === 'null';
                          const isTopMissing = !topPhone || topPhone === 'not available' || topPhone === 'undefined' || topPhone === 'null';

                          if (isMissing || isTopMissing) {
                              item.raw = item.raw || {};
                              item.raw.phone = phoneVal;
                              item.phone = phoneVal; // Update top level
                              
                              // also update array format
                              const existingPhones = Array.isArray(item.raw.contact__phone_numbers) ? item.raw.contact__phone_numbers : [];
                              const merged = [...existingPhones];
                              const isMobileCol = String(phoneColumn || '').toLowerCase().includes('mobile');
                              phoneVal.split(',').map(s=>s.trim()).filter(Boolean).forEach(v => {
                                  const m = v.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
                                  const num = m ? m[1].trim() : v;
                                  let type = m ? m[2].trim() : '';
                                  if (!type && isMobileCol) type = 'mobile';
                                  if (!merged.find(x => (x?.sanitized_number || x?.raw_number) === num)) {
                                      merged.push({ sanitized_number: num, raw_number: num, type });
                                  }
                              });
                              item.raw.contact__phone_numbers = merged;
                              modified = true;

                              // Ensure revealed record exists for this item
                              await RevealedContact.updateOne(
                                  { userId: user._id, leadId: item._id, contactType: 'phone' },
                                  { $setOnInsert: { status: 'charged' }, $set: { publicIdentifier: publicId || undefined } },
                                  { upsert: true }
                              );
                              console.log("[CSV Sync] Updated phone for item:", String(item._id));
                          }
                      }
                      // Sync Email
                      if (emailColumn && row[emailColumn] && String(row[emailColumn]).trim()) {
                          const emailVal = String(row[emailColumn]).trim();
                          
                          const rawEmail = item.raw?.email ? String(item.raw.email).toLowerCase() : '';
                          const topEmail = item.email ? String(item.email).toLowerCase() : '';
                          
                          const isMissing = !rawEmail || rawEmail === 'not available' || rawEmail === 'undefined' || rawEmail === 'null';
                          const isTopMissing = !topEmail || topEmail === 'not available' || topEmail === 'undefined' || topEmail === 'null';

                          if (isMissing || isTopMissing) {
                              item.raw = item.raw || {};
                              item.raw.email = emailVal;
                              item.email = emailVal; // Update top level
                              const existingEmails = Array.isArray(item.raw.contact__all_emails) ? item.raw.contact__all_emails : [];
                              const mergedEmails = [...existingEmails];
                              
                              let gStatus = 'unknown';
                              if (emailStatusColumn && row[emailStatusColumn]) {
                                   gStatus = String(row[emailStatusColumn]).trim();
                              }
                              
                              emailVal.split(/[;,]+/).map(s=>s.trim()).filter(Boolean).forEach(em => {
                                  if (!mergedEmails.find(x => (x?.email || x?.sanitized_email) === em)) {
                                      mergedEmails.push({ email: em, verificationStatus: gStatus });
                                  }
                              });
                              item.raw.contact__all_emails = mergedEmails;
                              if (gStatus && gStatus !== 'unknown') item.raw.email_status = gStatus; // update top level status too
                              modified = true;

                              await RevealedContact.updateOne(
                                  { userId: user._id, leadId: item._id, contactType: 'email' },
                                  { $setOnInsert: { status: 'charged' }, $set: { publicIdentifier: publicId || undefined } },
                                  { upsert: true }
                              );
                              console.log("[CSV Sync] Updated email for item:", String(item._id));
                          }
                      }
                      if (modified) {
                          console.log(`[CSV Sync] Updating item ${item._id} in list ${item.listId}`);
                          item.markModified('raw');
                          await item.save();
                      }
                  }
                  
                  // Sync to Search (Profile URL based Reveal Record)
                  if (publicId || lnUrl) {
                      const pUrl = lnUrl || mappedData.raw.public_profile_url || mappedData.raw.profile_url;
                      const normUrl = normalizeUrl(pUrl);
                      if (normUrl) {
                          if (phoneColumn && !csvColumnLooksCorporate(phoneColumn) && row[phoneColumn] && String(row[phoneColumn]).trim() && String(row[phoneColumn]).split(',').some(p => p.trim() && !isLikelyCorporatePhone(p))) {
                              await RevealedContact.updateOne(
                                  { userId: user._id, profileUrl: normUrl, contactType: 'phone' },
                                  { $setOnInsert: { status: 'charged' }, $set: { leadId, publicIdentifier: publicId || undefined } },
                                  { upsert: true }
                              );
                              console.log("[CSV Sync] Search reveal record upserted (phone) for:", normUrl);
                          }
                          if (emailColumn && row[emailColumn] && String(row[emailColumn]).trim()) {
                              await RevealedContact.updateOne(
                                  { userId: user._id, profileUrl: normUrl, contactType: 'email' },
                                  { $setOnInsert: { status: 'charged' }, $set: { leadId, publicIdentifier: publicId || undefined } },
                                  { upsert: true }
                              );
                              console.log("[CSV Sync] Search reveal record upserted (email) for:", normUrl);
                          }
                      }
                  }
              }
            } catch (syncErr) {
                console.error("Error syncing CSV reveal to duplicates:", syncErr);
            }

            try {
              const List = require('../models/List');
              const userLists = await List.find({ createdBy: user._id }).select('_id').lean();
              const userListIds = userLists.map(l => l._id);
              const rank = (s) => {
                const v = String(s || "").toLowerCase();
                if (v.includes('verified a+')) return 4;
                if (v.includes('verified')) return 3;
                if (v.includes('valid')) return 2;
                if (v.includes('unverified')) return 1;
                return 0;
              };
              for (const key of processedKeys) {
                const orClauses = [];
                if (key.includes('linkedin.com')) {
                  const norm = normalizeUrl(key);
                  orClauses.push({ 'raw.public_profile_url': norm });
                  orClauses.push({ 'raw.linkedin_url': norm });
                  orClauses.push({ 'raw.profile_url': norm });
                } else {
                  orClauses.push({ 'raw.public_identifier': key });
                  orClauses.push({ 'public_identifier': key });
                }
                const items = await ListItem.find({
                  listId: { $in: userListIds },
                  $or: orClauses
                });
                if (!items.length) continue;
                let emailMap = new Map();
                let bestStatus = '';
                let phoneSet = new Map();
                const nameCompanyPairs = new Set();
                for (const it of items) {
                  const arrE = Array.isArray(it.raw?.contact__all_emails) ? it.raw.contact__all_emails : [];
                  for (const e of arrE) {
                    const addr = e?.email || e?.sanitized_email;
                    const st = e?.verificationStatus || e?.status || it.raw?.email_status || '';
                    if (!addr) continue;
                    const prev = emailMap.get(addr);
                    if (!prev || rank(st) > rank(prev.verificationStatus || prev.status || '')) {
                      emailMap.set(addr, { email: addr, verificationStatus: st, status: st });
                    }
                    if (rank(st) > rank(bestStatus)) bestStatus = st;
                  }
                  const rawEmail = it.raw?.email;
                  if (rawEmail) {
                    rawEmail.split(/[;,]+/).map(s=>s.trim()).filter(Boolean).forEach(addr=>{
                      const st = it.raw?.email_status || '';
                      const prev = emailMap.get(addr);
                      if (!prev || rank(st) > rank(prev.verificationStatus || prev.status || '')) {
                        emailMap.set(addr, { email: addr, verificationStatus: st, status: st });
                      }
                      if (rank(st) > rank(bestStatus)) bestStatus = st;
                    });
                  }
                  const arrP = Array.isArray(it.raw?.contact__phone_numbers) ? it.raw.contact__phone_numbers : [];
                  for (const p of arrP) {
                    const num = p?.sanitized_number || p?.raw_number;
                    if (!num) continue;
                    const labeled = p?.type ? `${num} (${p.type})` : String(num);
                    if (isLikelyCorporatePhone(labeled) || csvColumnLooksCorporate(p?.type)) continue;
                    phoneSet.set(num, { sanitized_number: num, raw_number: num, type: p?.type || '' });
                  }
                  const rawPhone = it.raw?.phone;
                  if (rawPhone) {
                    rawPhone.split(',').map(s=>s.trim()).filter(Boolean).forEach(v=>{
                      if (isLikelyCorporatePhone(v)) return;
                      const m = v.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
                      const num = m ? m[1].trim() : v;
                      const type = m ? m[2].trim() : '';
                      if (isLikelyCorporatePhone(num) || csvColumnLooksCorporate(type)) return;
                      phoneSet.set(num, { sanitized_number: num, raw_number: num, type });
                    });
                  }
                  const nm = it.raw?.name;
                  const co = it.raw?.company || (it.raw?.current_positions && it.raw.current_positions[0] && it.raw.current_positions[0].company);
                  if (nm && co) nameCompanyPairs.add(JSON.stringify([nm, co]));
                }
                const emailAddrs = Array.from(emailMap.keys());
                const nameCompanyClauses = Array.from(nameCompanyPairs).map(s => {
                  const [nm, co] = JSON.parse(s);
                  return { $and: [{ 'raw.name': nm }, { 'raw.company': co }] };
                });
                const orExtra = [];
                if (emailAddrs.length) {
                  orExtra.push({ 'raw.email': { $in: emailAddrs } });
                  orExtra.push({ 'email': { $in: emailAddrs } });
                  orExtra.push({ 'raw.contact__all_emails.email': { $in: emailAddrs } });
                }
                const extraItems = (nameCompanyClauses.length || orExtra.length)
                  ? await ListItem.find({
                      listId: { $in: userListIds },
                      $or: [...nameCompanyClauses, ...orExtra]
                    })
                  : [];
                const seenIds = new Set(items.map(it => String(it._id)));
                for (const ex of extraItems) {
                  const idStr = String(ex._id);
                  if (!seenIds.has(idStr)) {
                    items.push(ex);
                    seenIds.add(idStr);
                  }
                }
                for (const it of items) {
                  let changed = false;
                  const hasTopEmail = !!(it.email && String(it.email).trim() && String(it.email).trim() !== 'Not available');
                  const hasTopPhone = !!(it.phone && String(it.phone).trim() && String(it.phone).trim() !== 'Not available');
                  if (!hasTopEmail && emailMap.size > 0) {
                    const first = Array.from(emailMap.values())[0];
                    it.email = first.email;
                    const existingArr = Array.isArray(it.raw?.contact__all_emails) ? it.raw.contact__all_emails : [];
                    const merged = [...existingArr];
                    for (const v of emailMap.values()) {
                      if (!merged.find(x => (x?.email || x?.sanitized_email) === v.email)) merged.push(v);
                    }
                    it.raw = it.raw || {};
                    it.raw.contact__all_emails = merged;
                    if (bestStatus) it.raw.email_status = bestStatus;
                    changed = true;
                  }
                  if (!hasTopPhone && phoneSet.size > 0) {
                    const isUploadedListItem = String(it.listId) === String(listId);
                    if (isUploadedListItem && !csvProvidesPersonalMobile) {
                      // Email-only / HQ-only CSV must not inherit mobiles from cache or other lists
                    } else {
                    const first = Array.from(phoneSet.values())[0];
                    const typeLabel = first.type ? ` (${first.type})` : '';
                    it.phone = first.sanitized_number + typeLabel;
                    const existingP = Array.isArray(it.raw?.contact__phone_numbers) ? it.raw.contact__phone_numbers : [];
                    const mergedP = [...existingP];
                    for (const v of phoneSet.values()) {
                      if (!mergedP.find(x => (x?.sanitized_number || x?.raw_number) === v.sanitized_number)) mergedP.push(v);
                    }
                    it.raw = it.raw || {};
                    it.raw.contact__phone_numbers = mergedP;
                    changed = true;
                    }
                  }
                  if (changed) {
                    it.markModified('raw');
                    await it.save();
                    console.log('[CSV Consolidation] Filled top-level fields for item:', String(it._id));
                  }
                }
              }
            } catch (consErr) {
              console.error('Error during consolidation pass:', consErr);
            }

            if (updatedCount + insertedCount === 0) {
              fs.unlinkSync(csvPath);
              return res.status(400).json({
                message: `Upload failed: No leads were updated or inserted. Check identifiers.`,
              });
            }

            // Deduct credits based on actual processed counts
            let totalCreditsDeducted = 0;
            let deductionMessage = "";
            
            if (isCompanies) {
               totalCreditsDeducted = companiesFound * COMPANY_CREDIT_COST;
               if (totalCreditsDeducted > availableCredits) totalCreditsDeducted = availableCredits;
               deductionMessage = `Deduct ${totalCreditsDeducted} credits for ${companiesFound} companies from uploaded CSV`;
            } else {
               totalCreditsDeducted = (phoneNumbersFound * PHONE_CREDIT_COST) + (emailsFound * EMAIL_CREDIT_COST);
               if (totalCreditsDeducted > availableCredits) totalCreditsDeducted = availableCredits;
               deductionMessage = `Deduct ${totalCreditsDeducted} credits for ${phoneNumbersFound} phone numbers and ${emailsFound} emails from uploaded CSV`;
            }
            
            console.log("[CSV Upload] Credits to deduct:", { isCompanies, companiesFound, phoneNumbersFound, emailsFound, totalCreditsDeducted, availableCredits });

            if (totalCreditsDeducted > 0) {
              try {
                await deductCreditsForUser(
                  user._id.toString(),
                  totalCreditsDeducted,
                  deductionMessage
                );
                console.log("[CSV Upload] Credits deducted successfully");
              } catch (creditError) {
                console.error("Credit deduction error:", creditError);
                fs.unlinkSync(csvPath);
                return res.status(400).json({ message: `Credit deduction failed: ${creditError.message}` });
              }
            }

            // Persist revealed contacts (best-effort) for people only
            if (!isCompanies && revealedContacts.length > 0 && totalCreditsDeducted > 0) {
              try {
                await RevealedContact.insertMany(revealedContacts);
                console.log("[CSV Upload] RevealedContact inserted:", revealedContacts.length);
              } catch (revealError) {
                console.error("Error inserting RevealedContact entries:", revealError);
              }
            }

            // Track new KnownField names
            try {
              const existingFields = await KnownField.find().select("name");
              const knownNames = existingFields.map((f) => f.name);
              const uniqueNewFields = new Set(
                Object.values(mappings).filter((dbField) => dbField && !knownNames.includes(dbField))
              );
              for (const newField of uniqueNewFields) {
                await KnownField.findOneAndUpdate({ name: newField }, { name: newField }, { upsert: true });
              }
            } catch (fieldError) {
              console.error("Error adding new known fields:", fieldError);
            }

            await AiQuery.findByIdAndUpdate(queryId, { status: "completed" });
            await List.findByIdAndUpdate(listId, { status: "active" });

            fs.unlinkSync(csvPath);

            // Email notify
            try {
              const itemType = isCompanies ? "Company List" : "Lead List";
              let statMessage = "";
              if (isCompanies) {
                 statMessage = companiesFound > 0
                  ? `${companiesFound} companies were processed, deducting ${totalCreditsDeducted} credits.`
                  : "No companies were processed due to insufficient credits.";
              } else {
                 statMessage = phoneNumbersFound > 0 || emailsFound > 0
                  ? `${phoneNumbersFound} phone numbers and ${emailsFound} emails were processed, deducting ${totalCreditsDeducted} credits.`
                  : "No phone numbers or emails were processed due to insufficient credits.";
              }

              const emailHtml = `<h1>Your ${itemType} is Ready!</h1><p>Hello ${user.name},</p><p>Your list, "<strong>${listName}</strong>", has been processed and is now active. ${statMessage}</p><p>View your list on the dashboard.</p>`;
              await sendEmail({
                to: user.email,
                subject: `✅ Your ${itemType} "${listName}" is Ready!`,
                html: emailHtml,
              });
              console.log("[CSV Upload] Notification email sent");
            } catch (emailError) {
              console.error("Failed to send email:", emailError);
            }

            res.json({
              message: `Upload complete. ${updatedCount} rows updated, ${insertedCount} rows inserted. ${isCompanies ? `${companiesFound} companies processed` : `${phoneNumbersFound} phone numbers and ${emailsFound} emails processed`}. ${totalCreditsDeducted} credits deducted.`,
              updatedCount,
              insertedCount,
              companiesFound,
              phoneNumbersFound,
              emailsFound,
              creditsDeducted: totalCreditsDeducted,
            });
            console.log("[CSV Upload] Completed summary:", { updatedCount, insertedCount, phoneNumbersFound, emailsFound, creditsDeducted: totalCreditsDeducted });
          } catch (dbError) {
            console.error("Database error during CSV processing:", dbError);
            fs.unlinkSync(csvPath);
            res.status(500).json({ message: "A database error occurred." });
          }
        })
        .on("error", (error) => {
          console.error("CSV parsing error:", error);
          if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
          res.status(400).json({ message: "Failed to parse CSV file." });
        });
    } catch (error) {
      console.error("Error processing CSV upload:", error);
      if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
      res.status(500).json({ message: "Failed to process CSV file." });
    }
  },
];

exports.uploadLeadsCSVForList = [
  multer({
    dest: os.tmpdir(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  }).single("leadsFile"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No CSV file was uploaded." });
    }

    const { listId } = req.params;
    const csvPath = req.file.path;

    try {
      const list = await List.findById(listId);
      if (!list) {
        fs.unlinkSync(csvPath);
        return res.status(404).json({ message: "List not found" });
      }

      // If flag is sent or we decide all admin uploads are "AI Queries"
      // We need to attach a queryId to the list if it doesn't have one.
      // We can create a "dummy" AiQuery record or reuse one.
      // But simpler: just create a placeholder AiQuery for this upload.
      if (req.body.isAiQuery === 'true' && !list.queryId) {
         const AiQuery = require('../models/AiQuery');
         const newQuery = await AiQuery.create({
            userId: list.createdBy,
            prompt: `Uploaded List: ${list.name}`,
            status: 'completed',
            numLeads: 0, // will update later
            searchFilter: {}
         });
         list.queryId = newQuery._id;
         await list.save();
      }
      if (req.body.isAiQuery === 'true') {
         const ListKind = require('../models/ListKind');
         try {
           await ListKind.updateOne({ listId: list._id }, { $set: { kind: 'ai_query' } }, { upsert: true });
         } catch (kindErr) {
           console.error("[CSV Upload] Failed to set list kind to ai_query:", kindErr.message);
         }
      }

      const leadsFromCsv = [];
      let originalHeaders = [];

      fs.createReadStream(csvPath)
        .pipe(csv({ 
          mapHeaders: ({ header }) => {
            // Normalize headers: remove BOM and trim, but KEEP casing to preserve original keys
            return (header || "").replace(/^\uFEFF/, '').trim(); 
          }
        }))
        .on("headers", (headers) => {
            originalHeaders = headers.map(h => (h || "").replace(/^\uFEFF/, '').trim());
        })
        .on("data", (row) => leadsFromCsv.push(row))
        .on("end", async () => {
          try {
            if (leadsFromCsv.length === 0) {
              fs.unlinkSync(csvPath);
              return res.status(400).json({ message: "CSV is empty or could not be parsed." });
            }

            let insertedCount = 0;
            const itemsToInsert = [];

            // Helper: strip all non-alphanumeric chars for robust matching
            const cleanKey = (k) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

            // Define comprehensive mapping for User Lists and AI Query Lists
            // Keys here are "clean" versions (lowercase, no spaces/symbols)
            const COLUMN_MAPPING = {
              // Identity
              'firstname': 'first_name',
              'lastname': 'last_name',
              'jobtitle': 'title',
              'title': 'title',
              'headline': 'headline',
              'seniority': 'seniority',
              'departments': 'departments',
              
              // Company
              'company': 'company',
              'companyname': 'company',
              'employees': 'employees', 
              'employeescount': 'employees',
              'companyheadcount': 'employees',
              'industry': 'industry',
              'foundedyear': 'founded_year',
              'annualrevenue': 'annual_revenue',
              'totalfunding': 'total_funding',
              'latestfunding': 'latest_funding',
              'latestfundingamount': 'latest_funding_amount',
              'lastraisedat': 'last_raised_at',
              'shortdescription': 'short_description',
              'description': 'short_description',
              'companyphone': 'company_phone',
              
              // Contact - Email
              'email': 'email',
              'businessemail1': 'email',
              'businessemail1status': 'email_status',
              'emailstatus': 'email_status',
              'businessemail2': 'email_2',
              'businessemail2status': 'email_2_status',
              'personalemail1': 'personal_email',
              'personalemail1status': 'personal_email_status',
              'personalemail2': 'personal_email_2',
              'personalemail2status': 'personal_email_2_status',
              
              // Contact - Phone
              'phone': 'phone',
              'mobilephone': 'phone',
              'secondphone': 'second_phone',
              'corporatephone': 'corporate_phone',
              'othernumbers1': 'other_phone',
              
              // Social & Web
              'personlinkedinurl': 'linkedin_url',
              'linkedinurl': 'linkedin_url',
              'publicprofileurl': 'linkedin_url',
              'website': 'website',
              'companylinkedinurl': 'company_linkedin_url',
              'facebookurl': 'facebook_url',
              'twitterurl': 'twitter_url',
              
              // Location
              'city': 'city',
              'state': 'state',
              'country': 'country',
              'address': 'address',
              'companyaddress': 'company_address',
              'companycity': 'company_city',
              'companystate': 'company_state',
              'companycountry': 'company_country',
              'companystreet': 'company_street',
              'companypostalcode': 'company_postal_code',
              'location': 'location',
              
              // Tech & Other
              'technologies': 'technologies',
              'keywords': 'keywords',
              'digitalmarketingsystems': 'digital_marketing_systems',
              'headers': 'headers',
              'original': 'original',
              'publicidentifier': 'public_identifier'
            };

            for (let i = 0; i < leadsFromCsv.length; i++) {
              const row = leadsFromCsv[i];
              const mappedRaw = {}; 
              
              // Store original row and headers (headers only on first item to save space)
              mappedRaw.__original = { ...row };
              if (i === 0) mappedRaw.__headers = [...originalHeaders];

              // Apply normalization mapping
              Object.keys(row).forEach(originalKey => {
                const normalizedKey = cleanKey(originalKey);
                
                if (COLUMN_MAPPING[normalizedKey]) {
                  const targetKey = COLUMN_MAPPING[normalizedKey];
                  mappedRaw[targetKey] = row[originalKey];
                } else {
                  // Fallback: use a snake_case version of the original key if not in mapping
                  const fallbackKey = originalKey.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
                  mappedRaw[fallbackKey] = row[originalKey];
                }
              });

              // Construct Full Name if missing but parts exist
              if (!mappedRaw.name && mappedRaw.first_name && mappedRaw.last_name) {
                mappedRaw.name = `${mappedRaw.first_name} ${mappedRaw.last_name}`.trim();
              } else if (mappedRaw.name && !mappedRaw.first_name) {
                 // Attempt to split name if only full name exists (fallback)
                 const parts = mappedRaw.name.split(' ');
                 if (parts.length > 0) mappedRaw.first_name = parts[0];
                 if (parts.length > 1) mappedRaw.last_name = parts.slice(1).join(' ');
              }

              reclassifyRawPhoneFields(mappedRaw);

              // Create the document to insert
              const mappedData = {
                listId,
                status: "Verified",
                raw: mappedRaw,
                // Top-level fields for easier querying/indexing if needed by schema (strict: false allows this)
                name: mappedRaw.name,
                email: mappedRaw.email,
                phone: mappedRaw.phone,
                linkedin_url: mappedRaw.linkedin_url
              };

              itemsToInsert.push(mappedData);
            }

            if (itemsToInsert.length > 0) {
               await ListItem.insertMany(itemsToInsert);
               insertedCount = itemsToInsert.length;
            }

            fs.unlinkSync(csvPath);

            // Notify user if requested
            if (req.body.sendNotification === 'true') {
              try {
                const user = await User.findById(list.createdBy);
                if (user) {
                  const emailHtml = `<h1>Your List is Ready!</h1>
                    <p>Hello ${user.name},</p>
                    <p>An admin has successfully uploaded and processed <strong>${insertedCount}</strong> leads for your list: "<strong>${list.name}</strong>".</p>
                    <p>You can now view your updated list on your dashboard.</p>`;
                  await sendEmail({
                    to: user.email,
                    subject: `✅ Your List "${list.name}" is Ready!`,
                    html: emailHtml,
                  });
                  console.log("[CSV Upload] Notification email sent for list ID:", listId);
                }
              } catch (emailError) {
                console.error("Failed to send notification email:", emailError);
              }
            }

            res.json({
              message: `Upload complete. ${insertedCount} leads inserted.`,
              insertedCount
            });

          } catch (dbError) {
            console.error("Database error during CSV processing:", dbError);
            if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
            res.status(500).json({ message: "A database error occurred." });
          }
        })
        .on("error", (error) => {
          console.error("CSV parsing error:", error);
          if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
          res.status(400).json({ message: "Failed to parse CSV file." });
        });
    } catch (error) {
      console.error("Error processing CSV upload:", error);
      if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
      res.status(500).json({ message: "Failed to process CSV file." });
    }
  },
];

exports.groupUsers = async (req, res) => {
  try {
    const { ownerId, memberIds, teamName } = req.body;

    if (!ownerId || !mongoose.Types.ObjectId.isValid(ownerId)) {
      return res.status(400).json({ message: 'Invalid owner ID' });
    }

    const owner = await User.findById(ownerId);
    if (!owner) return res.status(404).json({ message: 'Owner not found' });

    let org = await Organization.findById(owner.orgId);
    if (!org) {
      // Create one if for some reason they don't have it
      org = await Organization.create({
        name: teamName || `${owner.name}'s Team`,
        ownerId: owner._id,
        members: [{ userId: owner._id, role: "owner" }],
        seatsAllowed: memberIds.length || 1,
        planKey: owner.planKey || "FREE",
      });
      owner.orgId = org._id;
      owner.orgRole = "owner";
      await owner.save();
    } else {
      if (teamName) org.name = teamName;
      // Ensure owner is in members array
      const hasOwner = org.members.find(m => String(m.userId) === String(owner._id));
      if (!hasOwner) org.members.push({ userId: owner._id, role: "owner" });
    }

    // Process members
    if (memberIds && memberIds.length > 0) {
      for (const mId of memberIds) {
        if (String(mId) === String(owner._id)) continue;
        const memberUser = await User.findById(mId);
        if (!memberUser) continue;

        // Remove from previous org if any
        if (memberUser.orgId && String(memberUser.orgId) !== String(org._id)) {
          await Organization.updateOne(
            { _id: memberUser.orgId },
            { $pull: { members: { userId: memberUser._id } } }
          );
        }

        // Add to new org
        const existingMember = org.members.find(m => String(m.userId) === String(memberUser._id));
        if (!existingMember) {
          org.members.push({ userId: memberUser._id, role: "admin" }); // The prompt requested assigning an admin. We'll default them to 'admin' if grouped this way, or 'member'.
        } else {
          existingMember.role = "admin";
        }

        memberUser.orgId = org._id;
        memberUser.orgRole = "admin";
        await memberUser.save();
      }
    }

    // Ensure seats allowed is enough
    const totalMembers = org.members.length;
    if (org.seatsAllowed < totalMembers) {
      org.seatsAllowed = totalMembers;
    }

    await org.save();

    res.status(200).json({ message: 'Users grouped successfully', org });
  } catch (error) {
    console.error('Error grouping users:', error);
    res.status(500).json({ message: 'Server error while grouping users' });
  }
};

exports.adminAddTeamMember = async (req, res) => {
  try {
    const { ownerId, memberId } = req.body;
    const owner = await User.findById(ownerId);
    if (!owner) return res.status(404).json({ message: "Owner not found" });

    let org = null;
    if (owner.orgId) {
      org = await Organization.findById(owner.orgId);
    }
    
    if (!org) {
      org = await Organization.create({
        name: `${owner.name}'s Team`,
        ownerId: owner._id,
        members: [{ userId: owner._id, role: "owner" }],
        seatsAllowed: 1,
        planKey: owner.planKey || "FREE",
      });
      owner.orgId = org._id;
      owner.orgRole = "owner";
      await owner.save();
    }

    const member = await User.findById(memberId);
    if (!member) return res.status(404).json({ message: "Member not found" });

    if (String(member._id) === String(owner._id)) {
      return res.status(400).json({ message: "Cannot add owner as member" });
    }

    if (member.orgId && String(member.orgId) !== String(org._id)) {
      // Remove from previous org
      await Organization.updateOne({ _id: member.orgId }, { $pull: { members: { userId: member._id } } });
    }

    if (!org.members.find(m => String(m.userId) === String(member._id))) {
      org.members.push({ userId: member._id, role: "member" });
      await org.save();
    }

    member.orgId = org._id;
    member.orgRole = "member";
    await member.save();

    res.status(200).json({ message: "Member added successfully", org });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.adminRemoveTeamMember = async (req, res) => {
  try {
    const { ownerId, memberId } = req.body;
    const owner = await User.findById(ownerId);
    if (!owner || !owner.orgId) return res.status(404).json({ message: "Team not found" });

    const org = await Organization.findById(owner.orgId);
    if (!org) return res.status(404).json({ message: "Organization not found" });

    org.members = org.members.filter(m => String(m.userId) !== String(memberId));
    await org.save();

    const member = await User.findById(memberId);
    if (member) {
      member.orgId = null;
      member.orgRole = "user";
      await member.save();
    }

    res.status(200).json({ message: "Member removed successfully", org });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateCredits = async (req, res) => {
  try {
    const { userId, credits, type } = req.body;

    // Validate input
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }
    if (typeof credits !== 'number' || credits < 0) {
      return res.status(400).json({ message: 'Credits must be a non-negative number' });
    }

    // Find the user
    const user = await User.findById(userId).populate('orgId');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let previousCredits;
    let diff;
    let targetOrgId = null;

    if (type === 'pool' && user.orgId) {
      // Update the org pool
      const org = user.orgId;
      previousCredits = org.poolCredits || 0;
      diff = credits - previousCredits;
      org.poolCredits = credits;
      await org.save();
      targetOrgId = org._id;
    } else {
      // Update personal credits
      previousCredits = user.credits || 0;
      diff = credits - previousCredits;
      user.credits = credits;
      await user.save();
    }

    // Log the credit change
    if (diff !== 0) {
      await Credit.create({
        userId: user._id,
        organizationId: targetOrgId,
        amount: Math.abs(diff),
        type: diff > 0 ? "buy" : "deduct",
        description: diff > 0 ? (targetOrgId ? "Admin granted org pool credits" : "Admin granted personal credits") : (targetOrgId ? "Admin removed org pool credits" : "Admin removed personal credits"),
        balance: credits
      });
    }

    res.status(200).json({ message: 'Credits updated successfully' });
  } catch (error) {
    console.error('Error updating credits:', error);
    res.status(500).json({ message: 'Server error while updating credits' });
  }
};

exports.getUserCreditLogs = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Fetch the last 100 credit log entries for this user
    const logs = await Credit.find({ userId })
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json(logs);
  } catch (error) {
    console.error('Error fetching credit logs:', error);
    res.status(500).json({ message: 'Server error while fetching credit logs' });
  }
};

exports.updateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { allowMultipleSessions, linkedInUrl, companyName } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (allowMultipleSessions !== undefined) {
      user.allowMultipleSessions = allowMultipleSessions;
    }
    
    if (linkedInUrl !== undefined) {
      user.linkedInUrl = linkedInUrl;
    }

    if (companyName !== undefined) {
      user.companyName = companyName;
    }

    await user.save();

    if (linkedInUrl !== undefined || companyName !== undefined) {
      pushUserToInternalPipedrive(user).catch((err) => {
        console.error("[Pipedrive] admin user update sync failed:", err?.message || err);
      });
    }

    res.status(200).json({ message: "User updated successfully", user });
  } catch (err) {
    next(err);
  }
};

function extractRevealedContact(data) {
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.results)
    ? data.results
    : Array.isArray(data?.data)
    ? data.data
    : data
    ? [data]
    : [];
  const first = list[0] || {};
  const emails = first.emails || first.contact__all_emails || first.contact__emails || [];
  const phones = first.phones || first.contact__phone_numbers || [];
  const email =
    emails[0]?.email ||
    emails[0]?.sanitized_email ||
    (typeof emails[0] === "string" ? emails[0] : "") ||
    first.email ||
    "";
  const phone =
    phones[0]?.sanitized_number ||
    phones[0]?.raw_number ||
    phones[0]?.number ||
    (typeof phones[0] === "string" ? phones[0] : "") ||
    first.phone ||
    "";
  return { email: String(email || "").trim(), phone: String(phone || "").trim() };
}

async function fetchMawsoolContact(linkedinUrl) {
  const BASE_URL = process.env.MAWSOOL_API || "https://api.mawsool.tech";
  const API_KEY = process.env.MAWSOOL_API_KEY;
  if (!API_KEY) {
    const err = new Error("MAWSOOL_API_KEY not set");
    err.status = 500;
    throw err;
  }
  const u = new URL(`${BASE_URL}/contact`);
  u.searchParams.set("url", linkedinUrl);
  u.searchParams.set("fields", "email,phone");
  let last = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    last = await axios.get(u.toString(), {
      headers: {
        "X-API-Key": API_KEY,
        accept: "application/json",
        "x-mawsool-source": "Web App Backend (admin Pipedrive enrich)",
      },
      validateStatus: () => true,
      timeout: 30000,
    });
    if (last.status >= 400) break;
    const payload = last.data;
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.results)
      ? payload.results
      : payload
      ? [payload]
      : [];
    const processing = list.some((item) => {
      const s = String(item?.status || "").toLowerCase();
      const msg = String(item?.message || "").toLowerCase();
      return s === "processing" || msg.includes("in progress") || msg.includes("please retry");
    });
    if (!processing) break;
    if (attempt < 4) await new Promise((r) => setTimeout(r, 8000));
  }
  return last;
}

exports.pushUserToPipedrive = async (req, res) => {
  try {
    if (!isInternalConfigured()) {
      return res.status(503).json({ message: "Pipedrive is not configured" });
    }
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const ids = await pushUserToInternalPipedrive(user);
    return res.status(200).json({
      message: "Pushed to Pipedrive",
      personId: ids?.personId || null,
      orgId: ids?.orgId || null,
    });
  } catch (err) {
    console.error("[Pipedrive] admin push failed:", err?.message || err);
    return res.status(err.status || 500).json({ message: err.message || "Failed to push to Pipedrive" });
  }
};

exports.enrichUserContactToPipedrive = async (req, res) => {
  try {
    if (!isInternalConfigured()) {
      return res.status(503).json({ message: "Pipedrive is not configured" });
    }
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.linkedInUrl) {
      return res.status(400).json({ message: "User has no LinkedIn URL. Find LinkedIn first." });
    }

    const contactRes = await fetchMawsoolContact(user.linkedInUrl);
    if (!contactRes || contactRes.status >= 400) {
      return res.status(502).json({ message: "Contact enrich failed" });
    }
    const { email, phone } = extractRevealedContact(contactRes.data);
    const ids = await pushUserToInternalPipedrive(user, {
      email: email || user.email,
      phone: phone || undefined,
      linkedInUrl: user.linkedInUrl,
      companyName: user.companyName,
    });
    return res.status(200).json({
      message: "Contact enriched and Pipedrive updated",
      personId: ids?.personId || null,
      orgId: ids?.orgId || null,
      hasEmail: Boolean(email),
      hasPhone: Boolean(phone),
    });
  } catch (err) {
    console.error("[Pipedrive] admin enrich failed:", err?.message || err);
    return res.status(err.status || 500).json({ message: err.message || "Failed to enrich contact" });
  }
};

exports.updatePlan = async (req, res) => {
  try {
    const { userId, planKey, billingDate, billingMode, seatsAllowed } = req.body; // billingMode: 'month', 'year', or 'manual'

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }
    
    // Only validate planKey if it is provided
    if (planKey) {
        const validPlans = ["FREE", "BASIC", "PRO", "PREMIUM"];
        if (!validPlans.includes(planKey)) {
          return res.status(400).json({ message: 'Invalid plan key. Must be FREE, BASIC, PRO, or PREMIUM.' });
        }
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update the user's individual plan override
    if (planKey) {
        user.planKey = planKey;
        await user.save();
    }

    // Update Org Plan, Billing Date, and Seats
    if (user.orgId) {
        const org = await Organization.findById(user.orgId);
        if (org) {
            if (planKey) org.planKey = planKey;
            
            if (seatsAllowed !== undefined && seatsAllowed !== "") {
              org.seatsAllowed = Number(seatsAllowed);
            }
            
            // Calculate new date
            let newDate = org.currentPeriodEnd;
            if (billingMode === 'month') {
              const d = new Date();
              d.setMonth(d.getMonth() + 1);
              newDate = d;
            } else if (billingMode === 'year') {
              const d = new Date();
              d.setFullYear(d.getFullYear() + 1);
              newDate = d;
            } else if (billingDate) {
              newDate = new Date(billingDate);
            }
            
            // If date is still missing/invalid (e.g. 1970), default to 1 month from now
            if (!newDate || newDate.getFullYear() === 1970) {
               const d = new Date();
               d.setMonth(d.getMonth() + 1);
               newDate = d;
            }
            
            org.currentPeriodEnd = newDate;

            // If owner, update seats (only if no manual override was provided)
            if (planKey && org.ownerId.toString() === user._id.toString() && (seatsAllowed === undefined || seatsAllowed === "")) {
                let defaultSeats = 0; // Assuming 0 extra seats by default
                if (planKey === 'BASIC') defaultSeats = 0; 
                if (planKey === 'PRO') defaultSeats = 3;
                if (planKey === 'PREMIUM') defaultSeats = 7;
                
                if (org.seatsAllowed < defaultSeats) {
                    org.seatsAllowed = defaultSeats;
                }
            }
            await org.save();
        }
    }

    res.status(200).json({ message: 'Plan and billing date updated successfully' });
  } catch (error) {
    console.error('Error updating plan:', error);
    res.status(500).json({ message: 'Server error while updating plan' });
  }
};

exports.activateNoResults = async (req, res) => {
  try {
    const { queryId } = req.params;

    const query = await AiQuery.findById(queryId).populate("userId", "email name").populate("listId", "name");
    if (!query) {
      return res.status(404).json({ message: "Query not found." });
    }

    const listId = query.listId?._id;
    const user = query.userId;
    const listName = query.listId?.name || "Untitled List";

    // Update statuses
    query.status = "completed";
    await query.save();

    if (listId) {
      await List.findByIdAndUpdate(listId, { status: "active" });
    }

    // Send notification email
    if (user && user.email) {
      try {
        const emailHtml = `
          <h1>Your Lead List is Ready</h1>
          <p>Hello ${user.name},</p>
          <p>Your lead list, "<strong>${listName}</strong>", has been processed.</p>
          <p>Unfortunately, no leads were found matching your specific criteria at this time. The list has been marked as active with no results.</p>
          <p>You can view your list on the dashboard.</p>
        `;
        await sendEmail({
          to: user.email,
          subject: `✅ Your Lead List "${listName}" is Ready`,
          html: emailHtml,
        });
        console.log("[Activate No Results] Notification email sent");
      } catch (emailError) {
        console.error("[Activate No Results] Failed to send email:", emailError);
      }
    }

    res.json({ message: "List activated with no results." });
  } catch (error) {
    console.error("Error activating list with no results:", error);
    res.status(500).json({ message: "Failed to activate list." });
  }
};

exports.listBulkRevealJobReports = async (req, res) => {
  try {
    const { userId, listId, status } = req.query;
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20", 10)));

    const q = {};
    if (userId && mongoose.Types.ObjectId.isValid(userId)) q.userId = userId;
    if (listId && mongoose.Types.ObjectId.isValid(listId)) q.listId = listId;
    if (status) q.status = String(status);

    const reportsRaw = await BulkRevealJobReport.find(q)
      .populate('userId', 'email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const reports = (reportsRaw || []).map(r => ({
      ...r,
      userEmail: r.userId?.email || '',
      userId: r.userId?._id || r.userId
    }));

    const total = await BulkRevealJobReport.countDocuments(q);
    return res.status(200).json({ reports, page, limit, total });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch bulk reveal reports", error: error.message });
  }
};

exports.getBulkRevealJobReport = async (req, res) => {
  try {
    const { jobId } = req.params;
    if (!jobId) return res.status(400).json({ message: "Missing jobId" });
    const reportRaw = await BulkRevealJobReport.findOne({ jobId: String(jobId) }).populate('userId', 'email').lean();
    const report = reportRaw
      ? { ...reportRaw, userEmail: reportRaw.userId?.email || '', userId: reportRaw.userId?._id || reportRaw.userId }
      : null;
    if (!report) return res.status(404).json({ message: "Report not found" });
    return res.status(200).json({ report });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch bulk reveal report", error: error.message });
  }
};

exports.getRevealsSummary = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit || "50", 10)));
    const skip = (page - 1) * limit;

    const matchStage = { type: 'deduct' };
    if (req.query.date) {
      const startOfDay = new Date(req.query.date);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(req.query.date);
      endOfDay.setUTCHours(23, 59, 59, 999);
      matchStage.createdAt = { $gte: startOfDay, $lte: endOfDay };
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: {
            userId: "$userId",
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
          },
          totalCredits: { $sum: "$amount" },
          totalReveals: { $sum: 1 },
          extensionCount: {
            $sum: { $cond: [{ $regexMatch: { input: { $ifNull: ["$description", ""] }, regex: /\[EXTENSION\]/i } }, 1, 0] }
          },
          bulkCount: {
            $sum: {
              $cond: [
                { $or: [
                    { $regexMatch: { input: { $ifNull: ["$description", ""] }, regex: /Bulk/i } },
                    { $regexMatch: { input: { $ifNull: ["$description", ""] }, regex: /\[Webhook Sync\]/i } },
                    { $regexMatch: { input: { $ifNull: ["$description", ""] }, regex: /AI Query/i } }
                  ]
                }, 1, 0
              ]
            }
          }
        }
      },
      { $match: { totalCredits: { $gt: 0 } } },
      { $sort: { "_id.date": -1, totalCredits: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "_id.userId",
          foreignField: "_id",
          as: "user"
        }
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          userId: "$_id.userId",
          date: "$_id.date",
          totalCredits: 1,
          totalReveals: 1,
          extensionCount: 1,
          bulkCount: 1,
          siteCount: { $subtract: ["$totalReveals", { $add: ["$extensionCount", "$bulkCount"] }] },
          userName: "$user.name",
          userEmail: "$user.email"
        }
      }
    ];

    const countPipeline = [
      { $match: matchStage },
      { $group: { 
          _id: { userId: "$userId", date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } } },
          totalCredits: { $sum: "$amount" }
        } 
      },
      { $match: { totalCredits: { $gt: 0 } } },
      { $count: "total" }
    ];

    const [results, countResult] = await Promise.all([
      Credit.aggregate(pipeline),
      Credit.aggregate(countPipeline)
    ]);

    const total = countResult.length > 0 ? countResult[0].total : 0;

    res.status(200).json({
      summary: results,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error("Error fetching reveals summary:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.getRevealsReport = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit || "50", 10)));
    const skip = (page - 1) * limit;
    
    // Optional date filtering
    const dateQuery = {};
    if (req.query.date) {
      const startOfDay = new Date(req.query.date);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(req.query.date);
      endOfDay.setUTCHours(23, 59, 59, 999);
      dateQuery.createdAt = { $gte: startOfDay, $lte: endOfDay };
    }

    // Only get deduct logs that are reveals and consumed credits > 0
    const query = { 
      type: 'deduct', 
      amount: { $gt: 0 },
      ...dateQuery 
    };

    if (req.query.userId) {
      query.userId = new mongoose.Types.ObjectId(req.query.userId);
    }

    if (req.query.search) {
      // Escape regex special characters to prevent regex injection errors
      const escapedSearch = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.description = { $regex: escapedSearch, $options: 'i' };
    }

    const total = await Credit.countDocuments(query);
    const logsRaw = await Credit.find(query)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const logs = logsRaw.map(log => {
      let source = 'Site';
      const desc = log.description || '';
      
      if (desc.includes('[EXTENSION]')) {
        source = 'Extension';
      } else if (desc.includes('Bulk') || desc.includes('[Webhook Sync]') || desc.includes('AI Query')) {
        source = 'Bulk';
      }

      return {
        _id: log._id,
        createdAt: log.createdAt,
        user: log.userId ? { name: log.userId.name, email: log.userId.email } : null,
        description: desc,
        amount: log.amount,
        source
      };
    });

    res.status(200).json({
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error("Error fetching reveals report:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
