const AiQuery = require("../models/AiQuery");
const User = require("../models/User");
const Organization = require("../models/Organization");
const List = require("../models/List");
const ListItem = require("../models/ListItem");
const ListKind = require("../models/ListKind");
const sendEmail = require("../utils/sendEmail");
const axios = require("axios");
const { getBalanceForUser, deductCreditsForUser } = require("../utils/wallet");

exports.getQueryStatus = async (req, res) => {
  const userId = req.user.sub || req.user.id || req.user._id;
  const queryId = req.params.id;

  try {
    // Find the query, must belong to the current user
    const query = await AiQuery.findOne({
      _id: queryId,
      userId: userId,
    }).lean();
    if (!query) {
      return res.status(404).json({ msg: "Query not found or access denied" });
    }

    res.status(200).json({
      ...query,
    });
  } catch (err) {
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};

const titleCase = (s = "") =>
  String(s)
    .replace(/[_-]/g, " ")
    .replace(
      /\w\S*/g,
      (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
    );

const chip = (label) =>
  `<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 10px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;font-size:12px;color:#334155;">${label}</span>`;

const stringify = (v) => {
  if (v === null || v === undefined) return "N/A";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return String(v);
  // compact JSON for objects/arrays
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

const labelFor = (id, labelsMap) =>
  (labelsMap && (labelsMap[id] || labelsMap[String(id)])) || String(id);

const asArray = (v) => (Array.isArray(v) ? v : v != null ? [v] : []);

function renderValueList(values, labelsMap) {
  if (!values || values.length === 0) return "";
  return values
    .map((v) => {
      // handle objects with name/label fields
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const name = v.label || v.name || v.title || v.value || stringify(v);
        return chip(name);
      }
      return chip(labelFor(v, labelsMap));
    })
    .join("");
}

function buildCategoryRowHTML(key, data) {
  if (data == null) return "";

  const keyLabel = titleCase(key);

  // Popular structures
  const includes = Array.isArray(data.include)
    ? data.include
    : Array.isArray(data.includes)
    ? data.includes
    : null;
  const includeLabels = data.includeLabels || data.labels || null;

  const excludes = Array.isArray(data.exclude)
    ? data.exclude
    : Array.isArray(data.excludes)
    ? data.excludes
    : null;
  const excludeLabels = data.excludeLabels || null;

  const hasRange =
    data.range ||
    typeof data.min !== "undefined" ||
    typeof data.max !== "undefined";
  const range = data.range || { min: data.min, max: data.max };

  const hasValue = typeof data.value !== "undefined";
  const isBool = typeof data === "boolean" || typeof data.value === "boolean";

  // If it looks like a primitive/array, render chips directly
  if (
    !includes &&
    !excludes &&
    !hasRange &&
    !hasValue &&
    !isBool &&
    (Array.isArray(data) || typeof data !== "object")
  ) {
    const values = asArray(data);
    const chips = renderValueList(values, null);
    return `
      <div style="margin:6px 0;">
        <div style="font-weight:600;color:#0f172a;margin-bottom:4px;">${keyLabel}:</div>
        <div>${chips || chip(stringify(values[0] ?? "N/A"))}</div>
      </div>
    `;
  }

  // Build sections
  let sections = "";

  if (includes) {
    sections += `
      <div style="margin:2px 0;"><span style="font-weight:600;color:#334155;">Include:</span></div>
      <div>${renderValueList(includes, includeLabels) || chip("—")}</div>
    `;
  }

  if (excludes) {
    sections += `
      <div style="margin:6px 0 2px;"><span style="font-weight:600;color:#334155;">Exclude:</span></div>
      <div>${renderValueList(excludes, excludeLabels) || chip("—")}</div>
    `;
  }

  if (
    hasRange &&
    (typeof range.min !== "undefined" || typeof range.max !== "undefined")
  ) {
    const min = range.min ?? "—";
    const max = range.max ?? "—";
    sections += `
      <div style="margin:6px 0 2px;"><span style="font-weight:600;color:#334155;">Range:</span></div>
      <div>${chip(`${min} – ${max}`)}</div>
    `;
  }

  if (hasValue && typeof data.value !== "object") {
    sections += `
      <div style="margin:6px 0 2px;"><span style="font-weight:600;color:#334155;">Value:</span></div>
      <div>${chip(stringify(data.value))}</div>
    `;
  }

  if (isBool) {
    const boolVal = typeof data === "boolean" ? data : data.value;
    sections += `
      <div style="margin:6px 0 2px;"><span style="font-weight:600;color:#334155;">Value:</span></div>
      <div>${chip(boolVal ? "Yes" : "No")}</div>
    `;
  }

  // Fallback: if we still didn't produce anything meaningful, show compact JSON
  if (!sections) {
    sections = `
      <div style="margin:2px 0;"><span style="font-weight:600;color:#334155;">Details:</span></div>
      <div style="font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size:12px; color:#475569; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:6px 8px; display:inline-block;">
        ${stringify(data)}
      </div>
    `;
  }

  return `
    <div style="margin:6px 0;">
      <div style="font-weight:600;color:#0f172a;margin-bottom:4px;">${keyLabel}:</div>
      ${sections}
    </div>
  `;
}

function buildFiltersSectionHTMLAll(searchFilter = {}) {
  const keys = Object.keys(searchFilter || {});
  if (!keys.length) return "";

  const rows = keys
    .map((key) => buildCategoryRowHTML(key, searchFilter[key]))
    .filter(Boolean)
    .join("");

  if (!rows) return "";

  return `
    <div style="margin-top:14px;">
      <div style="font-size:14px;font-weight:700;margin:10px 0 8px 0;">Search Filters</div>
      ${rows}
    </div>
  `;
}

const labelsFromCommon = (cat) =>
  Array.isArray(cat?.include)
    ? cat.include.map((id) => cat.includeLabels?.[id] || String(id))
    : [];

// function buildLeadDetailsEmailHTML({
//   prompt,
//   listName,
//   numLeads,
//   includePhone,
//   searchFilter,
//   user,
//   firstLead,
// }) {
//   const jobTitles = labelsFromCommon(searchFilter?.role).join(", ") || "N/A";
//   const industries =
//     labelsFromCommon(searchFilter?.industry).join(", ") || "N/A";
//   const countries =
//     labelsFromCommon(searchFilter?.country || searchFilter?.location).join(
//       ", "
//     ) || "N/A";
//   const employees =
//     labelsFromCommon(searchFilter?.companySize || searchFilter?.employees).join(
//       ", "
//     ) || "any";

//   // const leadName = firstLead?.name || "N/A";
//   const leadName = firstLead?.name || "N/A";
//   const leadEmail = firstLead?.email || "";
//   const leadPhone = firstLead?.phone || firstLead?.phoneNumber || "N/A";

//   const filtersBlock = buildFiltersSectionHTMLAll(searchFilter);

//   return `
//     <div style="font-family:Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#111; line-height:1.6; font-size:14px;">
//       <h2 style="margin:0 0 12px 0;">Lead Details:</h2>

//       <p style="margin:4px 0;"><strong>Name:</strong> ${leadName}</p>
//       <p style="margin:4px 0;"><strong>Email:</strong> ${
//         leadEmail ? `<a href="mailto:${leadEmail}">${leadEmail}</a>` : "N/A"
//       }</p>
//       <p style="margin:4px 0;"><strong>Phone:</strong> ${leadPhone}</p>

//       <p style="margin:12px 0 4px;"><strong>Job Titles:</strong> ${jobTitles}</p>
//       <p style="margin:4px 0;"><strong>Industry:</strong> ${industries}</p>
//       <p style="margin:4px 0;"><strong>Country:</strong> ${countries}</p>
//       <p style="margin:4px 0;"><strong>Number of Employees:</strong> ${employees}</p>

//       <p style="margin:12px 0 4px;"><strong>Customer Message:</strong> ${prompt}</p>

//       ${filtersBlock}

//       <hr style="margin:16px 0; border:none; border-top:1px solid #eee;" />

//       <p style="margin:4px 0;"><strong>List Name:</strong> ${listName}</p>
//       <p style="margin:4px 0;"><strong>Leads Requested:</strong> ${numLeads}</p>
//       <p style="margin:4px 0;"><strong>Include Phone:</strong> ${
//         includePhone ? "Yes" : "No"
//       }</p>
//       ${
//         user
//           ? `<p style="margin:4px 0;"><strong>Submitted By:</strong> ${user.name} (${user.email})</p>`
//           : ""
//       }
//     </div>
//   `;
// }

function buildLeadDetailsEmailHTML({
  prompt,
  listName,
  numLeads,
  includePhone,
  searchFilter,
  searchMode,
  user,
}) {
  const isCompanies = searchMode === "companies";

  const jobTitles = labelsFromCommon(searchFilter?.role).join(", ") || "N/A";
  const industries =
    labelsFromCommon(searchFilter?.industry).join(", ") || "N/A";
  const countries =
    labelsFromCommon(searchFilter?.country || searchFilter?.location).join(
      ", "
    ) || "N/A";
  const employees =
    labelsFromCommon(searchFilter?.companySize || searchFilter?.employees).join(
      ", "
    ) || "any";

  // Use user details instead of lead details
  const requestorName = user?.name || "N/A";
  const requestorEmail = user?.email || "N/A";
  const requestorPhone = user?.phone || user?.phoneNumber || "N/A";

  const filtersBlock = buildFiltersSectionHTMLAll(searchFilter);

  const headerText = isCompanies ? "Company Search Details:" : "Lead Details:";
  const requestedLabel = isCompanies ? "Companies Requested:" : "Leads Requested:";

  return `
    <div style="font-family:Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#111; line-height:1.6; font-size:14px;">
      <h2 style="margin:0 0 12px 0;">${headerText}</h2>

      <p style="margin:4px 0;"><strong>Name:</strong> ${requestorName}</p>
      <p style="margin:4px 0;"><strong>Email:</strong> ${
        requestorEmail !== "N/A" ? `<a href="mailto:${requestorEmail}">${requestorEmail}</a>` : "N/A"
      }</p>
      <p style="margin:4px 0;"><strong>Phone:</strong> ${requestorPhone}</p>

      ${!isCompanies ? `<p style="margin:12px 0 4px;"><strong>Job Titles:</strong> ${jobTitles}</p>` : ''}
      <p style="margin:4px 0;"><strong>Industry:</strong> ${industries}</p>
      <p style="margin:4px 0;"><strong>Country:</strong> ${countries}</p>
      <p style="margin:4px 0;"><strong>Number of Employees:</strong> ${employees}</p>

      <p style="margin:12px 0 4px;"><strong>Customer Message:</strong> ${prompt}</p>

      ${filtersBlock}

      <hr style="margin:16px 0; border:none; border-top:1px solid #eee;" />

      <p style="margin:4px 0;"><strong>List Name:</strong> ${listName}</p>
      <p style="margin:4px 0;"><strong>${requestedLabel}</strong> ${numLeads}</p>
      ${!isCompanies ? `<p style="margin:4px 0;"><strong>Include Phone:</strong> ${includePhone ? "Yes" : "No"}</p>` : ''}
      <p style="margin:4px 0;"><strong>Submitted By:</strong> ${requestorName} (${requestorEmail})</p>
    </div>
  `;
}

exports.submitQuery = async (req, res) => {
  const {
    prompt,
    listName,
    numLeads,
    includePhone = false,
    searchFilter = {},
    searchMode = "people",
    maxPerCompany,
    result,
    aiEvaluationStats,
    aiEvaluations,
  } = req.body;

  const userId = req.user?.sub || req.user?.id || req.user?._id;

  if (!prompt || !listName || !numLeads) {
    return res.status(400).json({ msg: "All fields are required" });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    // --- Backend Security Check: Restrict AI Query to Paid Plans ---
    let plan = user.planKey;
    if (!plan && user.orgId) {
      const org = await Organization.findById(user.orgId);
      if (org) plan = org.planKey;
    }
    
    if (!plan || plan.toUpperCase() === "FREE") {
      return res.status(403).json({ msg: "The AI Query feature is only available on paid plans. Please upgrade your plan." });
    }
    // -------------------------------------------------------------

    // Calculate required credits
    let upfrontCost = numLeads * 1; // Base cost for AI search (deducted immediately)
    let totalProjectedCost = upfrontCost; // Total cost including reveals (used for balance check)

    if (searchMode !== "companies" && includePhone) {
      totalProjectedCost += numLeads * 20; // phone reveal
      totalProjectedCost += numLeads * 5;  // email reveal
    }

    // Check if user has enough credits (Personal + Team Pool)
    const currentCredits = await getBalanceForUser(userId);
    const totalAvailableCredits = currentCredits.scope === "org" 
      ? (currentCredits.balance + currentCredits.personalCredits) 
      : currentCredits.balance;

    if (totalAvailableCredits < totalProjectedCost) {
      return res.status(400).json({ msg: `Insufficient credits to complete this request. You need ${totalProjectedCost} credits, but you only have ${totalAvailableCredits}. Please buy more credits.` });
    }

    // Deduct ONLY the upfront cost (AI base cost)
    // REMOVED: We no longer deduct upfront. The user's balance is verified above,
    // and actual credits will be deducted when the admin uploads the fulfilled CSV.
    /*
    if (upfrontCost > 0) {
      await deductCreditsForUser(userId, upfrontCost, `AI Query: ${listName}`);
    }
    */

    // Create list
    const list = await List.create({
      name: listName,
      createdBy: userId,
      totalLeads: numLeads,
      listType: searchMode,
      isSyncing: true, // MUST be true so frontend polls and status transitions properly
    });
    await ListKind.updateOne({ listId: list._id }, { $set: { kind: 'ai_mode' } }, { upsert: true });

    const aiQuery = await AiQuery.create({
      userId,
      prompt,
      listId: list._id,
      numLeads,
      includePhone,
      searchFilter,
      aiEvaluationStats,
      aiEvaluations,
      status: "pending",
    });
    
    const html = buildLeadDetailsEmailHTML({
      prompt,
      listName,
      numLeads,
      includePhone,
      searchFilter,
      searchMode,
      user,
    });

    const isCompanies = searchMode === "companies";
    const itemLabel = isCompanies ? "companies" : "leads";
    const itemLabelSingular = isCompanies ? "company search" : "lead";
    
    // Delete all the old sample insertion code.
    // Instead, instantly trigger the bulk middleware so IT does all the fetching and saving!
    let middlewareUrl = process.env.MAWSOOL_SEARCH_API || process.env.MIDDLEWARE_URL || "http://127.0.0.1:3001";
    // Fix Node.js 18+ IPv6 localhost resolution bug
    middlewareUrl = middlewareUrl.replace('localhost', '127.0.0.1');
    
    // Always call bulk-save first! The middleware will auto-trigger bulk-reveal afterwards if revealType !== 'none'.
    // NOTE: For 'Submit AI Query' (which does not provide result array and has no aiEvaluations), we DO NOT trigger bulk-save.
    // Instead, we leave it 'pending' so it can be handled asynchronously by the internal team.
    
    const hasResults = result && Array.isArray(result) && result.length > 0;
    const isAiFulfillment = Array.isArray(aiEvaluations) && aiEvaluations.length > 0;

    // Only trigger bulk-save if we actually have result data OR it is an AI Mode fulfillment
    if (hasResults || isAiFulfillment) {
      const endpoint = 'bulk-save';
      const revealType = includePhone ? 'both' : 'none';
      
      const payload = {
        userId: userId,
        listId: list._id,
        initialItems: result || [], // Important: use initialItems, not items!
        requestedCount: numLeads, // Important: use requestedCount, not targetCount!
        filters: searchFilter, // Need filters for the middleware to fetch more if needed
        revealType: revealType, 
        maxPerCompany: maxPerCompany || null,
        userRole: user.role || 'user'
      };

      try {
        console.log(`[aiController] Triggering middleware ${endpoint} for list ${list._id}`);
        // We must pass the x-internal-secret header because the middleware bulk routes are internal background routes!
        axios.post(`${middlewareUrl}/api/jobs/${endpoint}`, payload, {
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": process.env.INTERNAL_SECRET || "secret123"
          },
          timeout: 5000 // Short timeout since we don't need to wait for it to finish
        }).catch(err => {
          console.error(`[aiController] Error triggering middleware ${endpoint}:`, err.message);
        });
      } catch (err) {
        console.error(`[aiController] Error preparing middleware request:`, err.message);
      }
    } else {
       console.log(`[aiController] Submit AI Query request received (no pre-fetched results). List ${list._id} left in pending state for internal processing.`);
       // Update list status to pending since it's a manual process
       await List.findByIdAndUpdate(list._id, { isSyncing: false });
    }

    // Send emails ONLY for manual "Submit AI Query" (skip for automated AI Mode fulfillment)
    if (!isAiFulfillment) {
      try {
        await sendEmail({
          to: process.env.ADMIN_MAIL,
          subject: `AI Query Submitted – ${listName} (${numLeads} ${itemLabel})`,
          html,
        });

        await sendEmail({
          to: user?.email,
          subject: `Your ${titleCase(itemLabelSingular)} Submission is Being Processed – ${listName} (${numLeads} ${itemLabel})`,
          html:`<p>Hi ${user?.name},</p>
                <p>Thank you for submitting your ${itemLabelSingular}. We have received your request successfully.
                Your list will be ready within 48 hours.</p>
                <p>Once it is ready, the status of your list will automatically change to Active on the List page.</p>
                <p>We’ll notify you as soon as it’s available.</p>`,
        });
      } catch (emailErr) {
        console.error("Failed to send AI Query emails, but continuing with list creation:", emailErr);
      }
    } else {
      console.log(`[aiController] Skipped sending emails for automated AI Mode list ${list._id}`);
    }

    return res.status(201).json({
      msg: "Query submitted successfully",
      queryId: aiQuery._id,
      listId: list._id,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Server error", error: err.message });
  }
};

exports.parseFilters = async (req, res) => {
  const { query, searchMode } = req.body;
  if (!query) {
    return res.status(400).json({ msg: "Query is required" });
  }

  try {
    const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
    if (!deepseekApiKey) {
      return res.status(500).json({ msg: "DeepSeek API key is not configured" });
    }

    // Construct the schema based on searchMode.
    const isCompanies = searchMode === "companies";

    const schema = {
        type: "object",
        properties: {
          is_semantic_needed: {
            type: "boolean",
            description: "Set to true ONLY if the user's prompt contains subjective requirements, or if the closest available industry filter is broader than the user's intended target entity (e.g. 'Schools' cannot be fully represented by the 'Education' industry, so semantic search must be enabled). Set to false ONLY when structured filters can identify the intended organizations with high precision."
          },
          semantic_sentences: {
            type: "array",
            items: { type: "string" },
            description: "If is_semantic_needed is true, generate 3-5 independent observations describing the ideal company's business model, operational characteristics, technology usage, or strategic direction. CRITICAL: The semantic_sentences field must NEVER repeat, paraphrase, or reference any hard constraint (e.g., country, city, industry, size). Each sentence must be useful for comparing against a company profile even if all filters were removed. Otherwise, leave empty."
          },
        filters: {
          type: "object",
          properties: {
            industry: {
              type: "object",
              properties: {
                include: { type: "array", items: { type: "string" } },
                exclude: { type: "array", items: { type: "string" } }
              }
            },
            location: {
              type: "object",
              properties: {
                include: { type: "array", items: { type: "string" } },
                exclude: { type: "array", items: { type: "string" } }
              }
            },
            city: {
              type: "object",
              properties: {
                include: { type: "array", items: { type: "string" } },
                exclude: { type: "array", items: { type: "string" } }
              }
            },
            company_headcount: {
              type: "object",
              description: "CRITICAL: MUST BE LEFT EMPTY unless the user explicitly types an exact employee count (e.g. '50 employees') or exact size category (e.g. 'Enterprise'). If the user says 'startup', 'fast-growing', or 'scale-up', YOU MUST LEAVE THIS EMPTY. If you infer headcount, the search will fail.",
              properties: {
                include: { type: "array", items: { type: "string" } },
                exclude: { type: "array", items: { type: "string" } }
              }
            }
          }
        }
      },
      required: ["is_semantic_needed", "filters"]
    };

    if (isCompanies) {
      Object.assign(schema.properties.filters.properties, {
        company_name: {
          type: "object",
          properties: {
            include: { type: "array", items: { type: "string" } },
            exclude: { type: "array", items: { type: "string" } }
          }
        },
        revenue: {
          type: "object",
          properties: {
            include: { type: "array", items: { type: "string" } },
            exclude: { type: "array", items: { type: "string" } }
          }
        },
        founded_year: {
          type: "object",
          properties: {
            include: { type: "array", items: { type: "string" } },
            exclude: { type: "array", items: { type: "string" } }
          }
        }
      });
    } else {
      Object.assign(schema.properties.filters.properties, {
        role: {
          type: "object",
          properties: {
            include: { type: "array", items: { type: "string" } },
            exclude: { type: "array", items: { type: "string" } }
          }
        },
        company: {
          type: "object",
          properties: {
            include: { type: "array", items: { type: "string" } },
            exclude: { type: "array", items: { type: "string" } }
          }
        },
        company_location: {
          type: "object",
          properties: {
            include: { type: "array", items: { type: "string" } },
            exclude: { type: "array", items: { type: "string" } }
          }
        },
        function: {
          type: "object",
          description: "CRITICAL: MUST BE LEFT EMPTY if 'role' is populated. If the user asks for 'Marketing Manager', put it in role and LEAVE THIS EMPTY. Do NOT extract 'Marketing' from the job title. Over-filtering breaks the search.",
          properties: {
            include: { type: "array", items: { type: "string" } },
            exclude: { type: "array", items: { type: "string" } }
          }
        },
        seniority: {
          type: "object",
          description: "CRITICAL: MUST BE LEFT EMPTY if 'role' is populated. If the user asks for 'Marketing Manager', put it in role and LEAVE THIS EMPTY. Do NOT extract 'Manager' from the job title. Over-filtering breaks the search.",
          properties: {
            include: { type: "array", items: { type: "string" } },
            exclude: { type: "array", items: { type: "string" } }
          }
        },
        experience: {
          type: "object",
          properties: {
            min: { type: "number" },
            max: { type: "number" }
          }
        },
        experience_at_role: {
          type: "object",
          properties: {
            min: { type: "number" },
            max: { type: "number" }
          }
        },
        past_company: {
          type: "object",
          properties: {
            include: { type: "array", items: { type: "string" } },
            exclude: { type: "array", items: { type: "string" } }
          }
        },
        school: {
          type: "object",
          properties: {
            include: { type: "array", items: { type: "string" } },
            exclude: { type: "array", items: { type: "string" } }
          }
        },
        language: {
          type: "object",
          properties: {
            include: { type: "array", items: { type: "string" } },
            exclude: { type: "array", items: { type: "string" } }
          }
        },
        past_role: {
          type: "object",
          properties: {
            include: { type: "array", items: { type: "string" } },
            exclude: { type: "array", items: { type: "string" } }
          }
        },
        behavioral_keywords: {
          type: "object",
          properties: {
            include: { type: "array", items: { type: "string" } },
            exclude: { type: "array", items: { type: "string" } }
          },
          description: "CRITICAL: ONLY for objective skills/tech (e.g. 'AWS'). Do NOT use for funding rounds (e.g. 'Series A'), growth stages ('fast-growing'), or subjective traits. Let semantic_sentences handle those. If you put subjective traits here, the system will break."
        }
      });
    }

    const systemPrompt = `You are a B2B Lead Intelligence search filter assistant.
Your task is to convert the user's natural language query into a structured JSON filter object.

CRITICAL INSTRUCTIONS: 
1. Extract ALL explicit and implicit criteria. 
2. Map locations to standard names or country codes (e.g., "UAE" -> "AE"). 

3. MULTIPLE INDUSTRY MAPPING: You MUST output an array of ALL relevant Main Categories from the provided list. Do NOT be conservative; think critically about adjacent industries. 
- Intersecting Sectors: If a prompt spans multiple sectors (e.g., "E-commerce"), include all relevant categories (e.g., "Retail", "Internet", "Computer Software", "Consumer Goods"). 
- Domain + Tech Rule: If a user asks for software or services in a specific niche (e.g., "HR software", "Healthcare IT"), you MUST include BOTH the technology industries -all of them if theres many- (e.g., "Computer Software", "Information Technology & Services") AND the subject-matter industries (e.g., "Human Resources", "Hospital & Health Care").
4. Sub-industries are ONLY supported when the search is strictly within the MENA region. If the search is global or outside MENA, you MUST NOT output sub-industries. 
5. If the user mentions negative criteria (e.g., "not from the US", "exclude HR"), populate the "exclude" arrays accordingly. 
6. For company size, use the provided employee brackets (e.g., "1-10", "11-50"). 
7. Ensure the output is valid JSON. Do NOT include markdown formatting or explanations. 
8. If the user asks for a specific company by name, put it in "company_name". 

9. DECIDING "is_semantic_needed": 
   - Set to FALSE ONLY IF the user's request can be 100% satisfied by structural dropdown filters (Role, Location, Broad Industry, Company Size). Example: "Give me CEOs in the UAE in the Real Estate industry." 
   - Set to TRUE IF the user includes ANY niche business models, growth stages, qualitative adjectives, technologies, or specific target audiences that standard industry categories cannot perfectly filter. Examples of when to use TRUE: "Startups", "B2B", "SaaS", "eco-friendly", "companies that sell to hospitals", "fast-growing", "AI-powered". 

10. "semantic_sentences": If is_semantic_needed is true, generate an array of 1-3 sentences describing the IDEAL COMPANY the user is targeting. Focus ONLY on the company's business model, product, or service. Do NOT include people/job titles in these sentences.
 11. MULTIPLE INDUSTRY MAPPING: You MUST output an array of ALL relevant Main Categories. If a user asks for software or services in a specific niche (e.g., "HR software", "Healthcare IT"), you MUST include BOTH the technology industries (e.g., "Computer Software", "Internet") AND the subject-matter industries (e.g., "Human Resources", "Hospital & Health Care"). Do not be conservative.

ADDITIONAL FILTER EXTRACTION RULES:

GENERAL PRINCIPLE:
Only populate a filter when the intent is clear and the value can be mapped confidently to an existing filter value.
If confidence is low, leave the filter empty.
Never invent values. Never create values that are not part of the platform's allowed filter options.

JOB TITLE VS SENIORITY & FUNCTION:
If the user explicitly requests a specific job title or role (e.g., "Marketing Manager", "CEO", "Founder", "CTO", "Software Engineer"), populate ONLY the 'role' filter.
Examples: 
- "CEO" -> role.include = ["CEO"]. 
- "Marketing Manager" -> role.include = ["Marketing Manager"].
- "CEOs and Founders" -> role.include = ["CEO", "Founder"].
CRITICAL: Do NOT additionally populate 'seniority' or 'function' when a specific role/title was requested. Do NOT put "Manager" in seniority and "Marketing" in function if the user is asking for "Marketing Manager" as a job title. This causes harmful over-filtering and will break the search engine.
Only use seniority and function when the user describes a generic level without a specific title (e.g., "Senior people in marketing" -> seniority: "Senior", function: "Marketing").

COMPANY HEADCOUNT / SIZE:
ONLY populate 'company_headcount' if the user explicitly states a number (e.g., "50 employees") or a strict size category (e.g., "Enterprise", "Small business").
CRITICAL: Do NOT infer company size from subjective words like "startup", "fast-growing", "scale-up", or "agencies". Leave headcount empty unless explicitly requested.

BEHAVIORAL KEYWORDS & SEMANTIC SEARCH:
  Use 'behavioral_keywords' ONLY for hard objective skills, technologies, or certifications (e.g., "AWS certified" -> ["AWS"]).
  CRITICAL: Do NOT use 'behavioral_keywords' for funding rounds (e.g., "Series A"), growth stages, or subjective traits.
  If 'is_semantic_needed' is true, let semantic_sentences handle concepts like "Series A", "fast-growing", etc., and leave behavioral_keywords empty for those traits.
  Do not force these values into role, company, industry, or function unless explicitly clear.

  SEMANTIC SEARCH GENERATION ENGINE 
 
 You act as a query decomposition engine for a B2B company search platform. 
 
 Your task is to separate: 
 
 1. HARD FILTERS (objective constraints) 
 2. SEMANTIC REQUIREMENTS (business intent) 
 
 OBJECTIVE 
 
 Generate semantic sentences that maximize retrieval quality against: 
 
 * company overviews 
 * company descriptions 
 * website content 
 * company specialties 
 * business summaries 
 
 The goal is NOT to restate the user's query. 
 
 The goal is to describe the type of company that would satisfy the search. 
 
 --- 
 
 HARD FILTERS 
 
 Place objective facts ONLY into filters. 
 
 Examples: 
 
 * Country 
 * City 
 * Industry 
 * Company size 
 * Headcount 
 * Job title 
 * Department 
 * Seniority 
 * Named company 
 
 Never repeat hard filters inside semantic sentences. 
 
 Example: 
 
 User: 
 "Fintech companies in Saudi Arabia" 
 
 BAD: 
 "The company operates in Saudi Arabia." 
 
 GOOD: 
 No geographic references. 
 
 --- 
 
 SEMANTIC SEARCH DECISION RULES 
 
 The purpose of semantic search is not only to handle subjective requirements. 
 Semantic search is required whenever structured filters cannot precisely identify the intended target organizations. 
 
 Set is_semantic_needed = true if ANY of the following conditions apply: 
 
 1. The query contains behavioral, strategic, operational, growth-stage, customer-type, product-type, technology, or use-case requirements. 
 
 2. The query refers to a specific organization type that cannot be uniquely represented by existing filters. 
 Examples: 
 - schools 
 - universities 
 - hospitals 
 - clinics 
 - family offices 
 - manufacturers 
 - training centers 
 - hotels 
 - nurseries 
 - tutoring centers 
 - youth organizations 
 - investment groups 
 
 3. The query requires identifying what a company DOES rather than what industry it belongs to. 
 Examples: 
 - companies selling to banks 
 - organizations using AI 
 - businesses with loyalty programs 
 - companies offering hair transplants 
 - firms targeting GCC customers 
 - organizations providing employee training 
 
 4. The closest available industry filter is broader than the user's intended target entity. 
 Example: 
 School -> Education industry is broader than schools. 
 Hospital -> Healthcare industry is broader than hospitals. 
 Hotel -> Hospitality industry is broader than hotels. 
 In these cases semantic search MUST be enabled. 
 
 Set is_semantic_needed = false only when structured filters alone can identify the intended organizations with high precision.
 
 --- 
 
 SEMANTIC SENTENCE RULES 
 
 CRITICAL: 
 
 Semantic sentences must describe: 
 
 * business activities 
 * products 
 * services 
 * customers 
 * use cases 
 * business models 
 * company behavior 
 
 NOT marketing adjectives. 
 
 AVOID words such as: 
 
 * innovative 
 * leading 
 * modern 
 * best 
 * disruptive 
 * fast-growing 
 * world-class 
 * top 
 * premier 
 
 These words perform poorly in vector search. 
 
 --- 
 
 USE OBSERVABLE SIGNALS 
 
 Always convert abstract concepts into observable business characteristics. 
 
 Example: 
 
 User: 
 "Fast-growing fintech startups" 
 
 BAD: 
 
 "The company is a fast-growing startup." 
 
 GOOD: 
 
 "The company provides digital financial products or services." 
 
 "The company appears to be expanding its products, customer base, or market presence." 
 
 "The company operates in an early-stage or growth-oriented phase of development." 
 
 "The company is actively building and scaling financial technology solutions." 
 
 --- 
 
 PROXY SIGNAL GENERATION 
 
 Many concepts are rarely written explicitly on company websites. 
 
 When this happens, generate realistic proxy signals. 
 
 Examples: 
 
 Query: 
 "Series A startups" 
 
 DO NOT WRITE: 
 
 "The company raised a Series A round." 
 
 WRITE: 
 
 "The company appears to be in an early growth stage." 
 
 "The company is actively expanding products, customers, or operations." 
 
 "The company is scaling a recently established business." 
 
 --- 
 
 BUSINESS MODEL FIRST 
 
 Always prioritize business model descriptions. 
 
 Example: 
 
 User: 
 "B2B cybersecurity startups helping banks prevent fraud" 
 
 Generate: 
 
 "The company provides cybersecurity solutions for financial institutions." 
 
 "The company helps organizations detect, prevent, or investigate fraudulent activities." 
 
 "The company offers risk monitoring, threat detection, or fraud prevention technologies." 
 
 "The company serves banks, payment providers, or financial organizations." 
 
 "The company develops software products designed to improve financial security." 
 
 --- 
 
 GENERATE MULTIPLE PERSPECTIVES 
 
 Create 5-8 semantic sentences. 
 
 Cover: 
 
 1. Business model 
 2. Products or services 
 3. Customers served 
 4. Use cases 
 5. Operational behavior 
 6. Growth characteristics (if relevant) 
 
 Each sentence should represent a different retrieval angle. 
 
 Avoid repeating the same concept. 
 
 --- 
 
 TARGET ENTITY VS SERVICE PROVIDER 
 
 Identify whether the user is searching for: 
 
 A. The actual target entity 
 
 OR 
 
 B. Vendors serving that entity 
 
 Examples: 
 
 "K-12 schools" 
 
 Generate sentences describing schools. 
 
 NOT software providers for schools. 
 
 "Manufacturing companies" 
 
 Generate sentences describing manufacturers. 
 
 NOT consultants serving manufacturers. 
 
 --- 
 
 INTERNAL USE CASES 
 
 When a query implies internal company behavior: 
 
 Example: 
 
 "Companies using AI" 
 
 Generate: 
 
 "The company integrates artificial intelligence into its internal operations, products, workflows, or decision-making processes." 
 
 "The company uses machine learning, automation, or AI technologies as part of its business activities." 
 
 Avoid generating sentences describing companies that merely sell AI software. 
 
 --- 
 
 SEMANTIC SENTENCE QUALITY CHECK 
 
 Before returning semantic_sentences: 
 
 Verify: 
 
 1. No locations included. 
 2. No company sizes included. 
 3. No job titles included. 
 4. No direct repetition of hard filters. 
 5. Each sentence describes a business characteristic. 
 6. Each sentence improves vector retrieval. 
 7. Sentences represent different retrieval angles. 
 8. Sentences are likely to match company overviews and website content. 
 
 --- 
 
 GOOD EXAMPLE 
 
 User: 
 "Fast-growing fintech startups" 
 
 semantic_sentences: 
 
 [ 
 "The company provides digital financial products, services, or technology solutions.", 
 "The company operates within financial technology markets and develops modern financial solutions.", 
 "The company appears to be expanding its products, services, customers, or market reach.", 
 "The company is actively building and scaling technology-driven financial offerings.", 
 "The company operates in a growth-oriented phase of business development.", 
 "The company develops software, platforms, or infrastructure supporting financial transactions or financial services." 
 ] 
 
 --- 
 
 GOOD EXAMPLE 
 
 User: 
 "Healthcare companies using AI" 
 
 semantic_sentences: 
 
 [ 
 "The company provides healthcare-related products or services.", 
 "The company uses artificial intelligence, machine learning, or advanced analytics within its operations or offerings.", 
 "The company leverages technology to improve healthcare delivery, diagnostics, workflows, or patient outcomes.", 
 "The company integrates data-driven decision making into healthcare processes.", 
 "The company applies AI technologies to solve healthcare challenges." 
 ]

  COMPANY FILTER VALIDATION:
Only populate company/company_name when the value is clearly a specific company name (e.g., "Oracle").
Do NOT populate company filters for generic business categories like "Startups", "Banks", "Family offices", or "Law firms". Attempt to map these concepts to 'industry' when possible.

HQ LOCATION RULES:
location = person/company operating location. company_location = headquarters location.
Only populate 'company_location' when the user explicitly indicates headquarters (e.g., "HQ in Germany", "German headquarters"). Otherwise, use 'location'.

REGIONAL LOCATION EXPANSION:
Never return broad regions such as GCC, MENA, Europe, Benelux, DACH, Nordics, APAC.
Expand them into the corresponding countries and place them in location.include.
Example: GCC -> Saudi Arabia, United Arab Emirates, Qatar, Kuwait, Bahrain, Oman.
Example: DACH -> Germany, Austria, Switzerland.

INDUSTRY MAPPING & REGION RULES:
1. MULTI-SELECT: If the user's intent spans multiple industries (e.g. "Tech companies"), you MUST output an array of ALL relevant Main Categories.
2. NO EMPTY INDUSTRIES: Do NOT leave the industry filter empty unless it is 100% certain the user did not specify any industry context.
3. MENA VS GLOBAL SUB-INDUSTRIES:
   - Sub-industries are ONLY supported when the search is strictly within the MENA region (e.g., Saudi Arabia, UAE, Egypt, Qatar, Kuwait, Bahrain, Oman, Jordan, Lebanon, etc.).
   - If the search is Global or outside MENA (e.g., USA, UK, Global), you MUST ONLY use MAIN INDUSTRIES. Do NOT output any Sub-Industries for global searches.

STRICT VALUE VALIDATION:
1. Verify every populated value exists in the platform's allowed values.
2. Remove any value that does not exist.
3. Never output placeholder or guessed values.

ALLOWED EXACT STRINGS FOR STRICT FILTERS:
For 'company_headcount', use exact strings from this list: ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10,001+"].
For 'seniority', use exact strings from this list: ["Owner / Founder", "CXO", "Partner", "VP", "Head", "Director", "Manager", "Senior", "Entry", "Intern"].
For 'function' (Department), use exact strings from this list: ["Operations", "Business Development", "Sales", "Education", "Engineering", "Healthcare Services", "Information Technology", "Administrative", "Arts and Design", "Customer Success and Support", "Finance", "Community and Social Services", "Media and Communication", "Accounting", "Marketing", "Human Resources", "Research", "Program and Project Management", "Legal", "Military and Protective Services", "Consulting", "Entrepreneurship", "Real Estate", "Quality Assurance", "Purchasing", "Product Management", "Leadership"].
For 'industry', use exact strings from this hierarchical list:
"Accounting"
"Airlines/Aviation"
"Alternative Dispute Resolution"
"Alternative Medicine"
"Animation" (Includes: Animation and Post-production)
"Apparel & Fashion" (Includes: Apparel Manufacturing, Fashion Accessories Manufacturing, Footwear Manufacturing, Footwear and Leather Goods Repair, Leather Product Manufacturing, Retail Apparel and Fashion, Wholesale Apparel and Sewing Supplies, Wholesale Footwear, Women's Handbag Manufacturing)
"Architecture & Planning" (Includes: Accessible Architecture and Design, Architecture and Planning, Community Development and Urban Planning, Regenerative Design)
"Arts & Crafts"
"Automotive" (Includes: Alternative Fuel Vehicle Manufacturing, Motor Vehicle Manufacturing, Motor Vehicle Parts Manufacturing, Retail Motor Vehicles, Vehicle Repair and Maintenance, Wholesale Motor Vehicles and Parts)
"Aviation & Aerospace" (Includes: Aviation and Aerospace Component Manufacturing)
"Banking" (Includes: Investment Banking)
"Biotechnology" (Includes: Biotechnology Research)
"Broadcast Media" (Includes: Broadcast Media Production and Distribution, Cable and Satellite Programming, Radio and Television Broadcasting)
"Building Materials" (Includes: Clay and Refractory Products Manufacturing, Construction Hardware Manufacturing, Lime and Gypsum Products Manufacturing, Retail Building Materials and Garden Equipment, Wholesale Building Materials, Wholesale Hardware, Plumbing, Heating Equipment)
"Business Supplies & Equipment" (Includes: Commercial and Industrial Equipment Rental, Equipment Rental Services, Retail Office Equipment, Retail Office Supplies and Gifts)
"Capital Markets"
"Chemicals" (Includes: Agricultural Chemical Manufacturing, Artificial Rubber and Synthetic Fiber Manufacturing, Chemical Manufacturing, Chemical Raw Materials Manufacturing, Paint, Coating, and Adhesive Manufacturing, Rubber Products Manufacturing, Soap and Cleaning Product Manufacturing, Wholesale Chemical and Allied Products)
"Civic & Social Organization" (Includes: Civic and Social Organizations, Community Services)
"Civil Engineering" (Includes: Surveying and Mapping Services)
"Commercial Real Estate"
"Computer & Network Security" (Includes: Computer and Network Security, Data Security Software Products)
"Computer Games" (Includes: Mobile Gaming Apps)
"Computer Hardware" (Includes: Accessible Hardware Manufacturing, Computer Hardware Manufacturing, Magnetic and Optical Media Manufacturing, Smart Meter Manufacturing, Wholesale Computer Equipment)
"Computer Networking" (Includes: Computer Networking Products)
"Computer Software" (Includes: Desktop Computing Software Products, Embedded Software Products, IT System Custom Software Development, Mobile Computing Software Products, Software Development)
"Construction" (Includes: Building Construction, Building Equipment Contractors, Building Finishing Contractors, Building Structure and Exterior Contractors, Construction Hardware Manufacturing, Highway, Street, and Bridge Construction, Nonresidential Building Construction, Residential Building Construction, Specialty Trade Contractors, Utility System Construction)
"Consumer Electronics" (Includes: Retail Appliances, Electrical, and Electronic Equipment, Wholesale Appliances, Electrical, and Electronics)
"Consumer Goods" (Includes: Apparel & Fashion, Consumer Electronics, Luxury Goods & Jewelry, Personal Care Product Manufacturing, Retail Appliances, Electrical, and Electronic Equipment, Retail Health and Personal Care Products)
"Consumer Services" (Includes: Consumer Goods Rental, Death Care Services, Funeral Services, Household Services, Personal Care Services, Personal and Laundry Services, Pet Services)
"Cosmetics" (Includes: Personal Care Product Manufacturing, Retail Health and Personal Care Products)
"Dairy" (Includes: Dairy Product Manufacturing)
"Defense & Space" (Includes: Defense and Space Manufacturing, Space Research and Technology)
"Design" (Includes: Design Services, Graphic Design, Interior Design, Regenerative Design)
"E-learning" (Includes: E-Learning Providers)
"Education" (Includes: Education Administration Programs, Education Management)
"Electrical & Electronic Manufacturing" (Includes: Appliances, Electrical, and Electronics Manufacturing, Audio and Video Equipment Manufacturing, Communications Equipment Manufacturing, Computers and Electronics Manufacturing, Electric Lighting Equipment Manufacturing, Electrical Equipment Manufacturing, Electronic and Precision Equipment Maintenance, Household Appliance Manufacturing, Measuring and Control Instrument Manufacturing)
"Entertainment" (Includes: Entertainment Providers)
"Environmental Services" (Includes: Air, Water, and Waste Program Management, Climate Data and Analytics, Conservation Programs, Environmental Quality Programs)
"Events Services"
"Executive Office"
"Facilities Services" (Includes: Janitorial Services, Landscaping Services, Laundry and Drycleaning Services, Repair and Maintenance)
"Farming" (Includes: Animal Feed Manufacturing, Farming, Ranching, Forestry, Horticulture)
"Financial Services" (Includes: Collection Agencies, Credit Intermediation, Funds and Trusts, Holding Companies, Loan Brokers, Pension Funds, Trusts and Estates)
"Fine Art"
"Fishery"
"Food & Beverages" (Includes: Baked Goods Manufacturing, Beverage Manufacturing, Caterers, Food Production, Food and Beverage Manufacturing, Food and Beverage Retail, Food and Beverage Services, Fruit and Vegetable Preserves Manufacturing, Meat Products Manufacturing, Mobile Food Services, Seafood Product Manufacturing, Sugar and Confectionery Product Manufacturing, Wholesale Food and Beverage)
"Food Production"
"Fundraising" (Includes: Philanthropic Fundraising Services, Venture Capital & Private Equity)
"Furniture" (Includes: Furniture and Home Furnishings Manufacturing, Household and Institutional Furniture Manufacturing, Mattress and Blinds Manufacturing, Office Furniture and Fixtures Manufacturing, Retail Furniture and Home Furnishings, Reupholstery and Furniture Repair, Wholesale Furniture and Home Furnishings)
"Glass, Ceramics & Concrete" (Includes: Glass Product Manufacturing, Glass, Ceramics and Concrete Manufacturing)
"Government Administration" (Includes: Administration of Justice)
"Government Relations" (Includes: Government Relations Services)
"Graphic Design"
"Health, Wellness & Fitness" (Includes: Wellness and Fitness Services)
"Higher Education"
"Hospital & Health Care" (Includes: Ambulance Services, Emergency and Relief Services, Family Planning Centers, Health and Human Services, Home Health Care Services, Hospitals, Hospitals and Health Care, Nursing Homes and Residential Care Facilities, Outpatient Care Centers, Public Health)
"Hospitality" (Includes: Accommodation and Food Services, Bed-and-Breakfasts, Hostels, Homestays, Hotels and Motels)
"Human Resources" (Includes: Human Resources Services)
"Import & Export"
"Individual & Family Services" (Includes: Child Day Care Services, Emergency and Relief Services, Individual and Family Services, Services for the Elderly and Disabled)
"Industrial Automation" (Includes: Robot Manufacturing, Robotics Engineering)
"Information Services"
"Information Technology & Services" (Includes: Blockchain Services, Business Intelligence Platforms, Computer Software, Data Infrastructure and Analytics, Desktop Computing Software Products, Digital Accessibility Services, Embedded Software Products, IT Services and IT Consulting, IT System Custom Software Development, IT System Data Services, IT System Design Services, IT System Installation and Disposal, IT System Operations and Maintenance, IT System Testing and Evaluation, IT System Training and Support, Information Services, Mobile Computing Software Products, Software Development, Space Research and Technology, Technology, Information and Internet, Technology, Information and Media)
"Insurance" (Includes: Claims Adjusting, Actuarial Services, Insurance Agencies and Brokerages, Insurance Carriers, Insurance and Employee Benefit Funds)
"International Affairs"
"International Trade & Development" (Includes: Housing and Community Development, International Trade and Development)
"Internet" (Includes: Internet Marketplace Platforms, Internet News, Social Networking Platforms)
"Investment Banking" (Includes: Securities and Commodity Exchanges)
"Investment Management" (Includes: Investment Advice)
"Judiciary"
"Legal Services" (Includes: Correctional Institutions, Courts of Law, Judiciary, Law Enforcement, Law Practice)
"Legislative Office"
"Leisure, Travel & Tourism" (Includes: Amusement Parks and Arcades, Circuses and Magic Shows, Sightseeing Transportation, Travel Arrangements)
"Libraries"
"Logistics & Supply Chain" (Includes: Freight and Package Transportation, Maritime, Maritime Transportation, Packaging & Containers, Rail Transportation, Transportation, Logistics, Supply Chain and Storage, Transportation/Trucking/Railroad, Truck Transportation, Warehousing, Warehousing and Storage)
"Luxury Goods & Jewelry" (Includes: Retail Luxury Goods and Jewelry, Wholesale Luxury Goods and Jewelry)
"Machinery" (Includes: Agriculture, Construction, Mining Machinery Manufacturing, Automation Machinery Manufacturing, Commercial and Industrial Machinery Maintenance, Commercial and Service Industry Machinery Manufacturing, Engines and Power Transmission Equipment Manufacturing, HVAC and Refrigeration Equipment Manufacturing, Industrial Machinery Manufacturing, Machinery Manufacturing, Metalworking Machinery Manufacturing, Wholesale Machinery)
"Management Consulting" (Includes: Administrative and Support Services, Business Consulting and Services, Operations Consulting, Professional Services, Strategic Management Services)
"Manufacturing" (Includes: Abrasives and Nonmetallic Minerals Manufacturing, Accessible Hardware Manufacturing, Agricultural Chemical Manufacturing, Agriculture, Construction, Mining Machinery Manufacturing, Alternative Fuel Vehicle Manufacturing, Animal Feed Manufacturing, Apparel Manufacturing, Appliances, Electrical, and Electronics Manufacturing, Architectural and Structural Metal Manufacturing, Artificial Rubber and Synthetic Fiber Manufacturing, Audio and Video Equipment Manufacturing, Automation Machinery Manufacturing, Aviation and Aerospace Component Manufacturing, Baked Goods Manufacturing, Beverage Manufacturing, Boilers, Tanks, and Shipping Container Manufacturing, Chemical Manufacturing, Chemical Raw Materials Manufacturing, Clay and Refractory Products Manufacturing, Climate Technology Product Manufacturing, Commercial and Service Industry Machinery Manufacturing, Communications Equipment Manufacturing, Computer Hardware Manufacturing, Computers and Electronics Manufacturing, Construction Hardware Manufacturing, Cutlery and Handtool Manufacturing, Dairy Product Manufacturing, Defense and Space Manufacturing, Electric Lighting Equipment Manufacturing, Electrical & Electronic Manufacturing, Electrical Equipment Manufacturing, Engines and Power Transmission Equipment Manufacturing, Fashion Accessories Manufacturing, Food and Beverage Manufacturing, Footwear Manufacturing, Fruit and Vegetable Preserves Manufacturing, Fuel Cell Manufacturing, Furniture and Home Furnishings Manufacturing, Glass Product Manufacturing, Glass, Ceramics and Concrete Manufacturing, HVAC and Refrigeration Equipment Manufacturing, Household Appliance Manufacturing, Household and Institutional Furniture Manufacturing, Industrial Machinery Manufacturing, Leather Product Manufacturing, Lime and Gypsum Products Manufacturing, Machinery Manufacturing, Magnetic and Optical Media Manufacturing, Mattress and Blinds Manufacturing, Measuring and Control Instrument Manufacturing, Meat Products Manufacturing, Medical Equipment Manufacturing, Metal Valve, Ball, and Roller Manufacturing, Metalworking Machinery Manufacturing, Motor Vehicle Manufacturing, Motor Vehicle Parts Manufacturing, Office Furniture and Fixtures Manufacturing, Oil and Coal Product Manufacturing, Packaging and Containers Manufacturing, Paint, Coating, and Adhesive Manufacturing, Paper and Forest Product Manufacturing, Personal Care Product Manufacturing, Pharmaceutical Manufacturing, Plastics Manufacturing, Plastics and Rubber Product Manufacturing, Primary Metal Manufacturing, Railroad Equipment Manufacturing, Renewable Energy Equipment Manufacturing, Renewable Energy Semiconductor Manufacturing, Robot Manufacturing, Rubber Products Manufacturing, Seafood Product Manufacturing, Smart Meter Manufacturing, Soap and Cleaning Product Manufacturing, Sporting Goods Manufacturing, Spring and Wire Product Manufacturing, Sugar and Confectionery Product Manufacturing, Textile Manufacturing, Transportation Equipment Manufacturing, Turned Products and Fastener Manufacturing, Women's Handbag Manufacturing, Wood Product Manufacturing)
"Maritime" (Includes: Maritime Transportation)
"Market Research"
"Marketing & Advertising" (Includes: Advertising Services, Marketing Services)
"Mechanical Or Industrial Engineering" (Includes: Cutlery and Handtool Manufacturing, Engineering Services)
"Media Production" (Includes: Business Content, Media and Telecommunications, Sound Recording, Technology, Information and Media)
"Medical Device" (Includes: Medical Equipment Manufacturing)
"Medical Practice" (Includes: Chiropractors, Dentists, Medical Practices, Medical and Diagnostic Laboratories, Optometrists, Physical, Occupational and Speech Therapists, Physicians, Services for the Elderly and Disabled)
"Mental Health Care"
"Military" (Includes: Armed Forces, Military and International Affairs)
"Mining & Metals" (Includes: Abrasives and Nonmetallic Minerals Manufacturing, Architectural and Structural Metal Manufacturing, Boilers, Tanks, and Shipping Container Manufacturing, Fabricated Metal Products, Metal Ore Mining, Metal Treatments, Metal Valve, Ball, and Roller Manufacturing, Mining, Nonmetallic Mineral Mining, Primary Metal Manufacturing, Spring and Wire Product Manufacturing, Turned Products and Fastener Manufacturing, Wholesale Metals and Minerals)
"Motion Pictures & Film" (Includes: Movies and Sound Recording, Movies, Videos, and Sound)
"Museums & Institutions" (Includes: Historical Sites, Museums, Museums, Historical Sites, and Zoos, Zoos and Botanical Gardens)
"Nanotechnology" (Includes: Nanotechnology Research)
"Newspapers" (Includes: Newspaper Publishing)
"Non-profit Organization Management" (Includes: Non-profit Organizations)
"Oil & Energy" (Includes: Coal Mining, Energy Technology, Fossil Fuel Electric Power Generation, Natural Gas Distribution, Natural Gas Extraction, Oil Extraction, Oil and Coal Product Manufacturing, Oil and Gas, Oil, Gas, and Mining, Retail Gasoline, Wholesale Petroleum and Petroleum Products)
"Online Media" (Includes: Online Audio and Video Media)
"Other Industries"
"Outsourcing/Offshoring" (Includes: Outsourcing and Offshoring Consulting, Telephone Call Centers)
"Package/Freight Delivery" (Includes: Freight and Package Transportation, Postal Services)
"Packaging & Containers" (Includes: Packaging and Containers Manufacturing)
"Paper & Forest Products" (Includes: Forestry and Logging, Paper and Forest Product Manufacturing, Wood Product Manufacturing)
"Performing Arts" (Includes: Dance Companies, Performing Arts and Spectator Sports, Theater Companies)
"Pharmaceuticals" (Includes: Pharmaceutical Manufacturing, Retail Health and Personal Care Products, Retail Pharmacies)
"Philanthropy"
"Photography"
"Plastics" (Includes: Plastics Manufacturing, Plastics and Rubber Product Manufacturing)
"Political Organization"
"Primary/Secondary Education"
"Printing" (Includes: Printing Services)
"Professional Organizations"
"Professional Training & Coaching" (Includes: Cosmetology and Barber Schools, Fine Arts Schools, Flight Training, Language Schools, Professional Training and Coaching, Secretarial Schools, Technical and Vocational Training, Vocational Rehabilitation Services)
"Program Development"
"Public Policy" (Includes: Economic Programs, Housing Programs, Public Assistance Programs, Public Policy Offices)
"Public Relations & Communications" (Includes: Public Relations and Communications Services)
"Public Safety" (Includes: Fire Protection)
"Public Works"
"Publishing" (Includes: Book Publishing, Book and Periodical Publishing, Internet Publishing, Periodical Publishing)
"Railroad Manufacture" (Includes: Railroad Equipment Manufacturing)
"Ranching" (Includes: Ranching and Fisheries)
"Real Estate" (Includes: Commercial Real Estate, Commercial and Industrial Equipment Rental, Equipment Rental Services, Leasing Non-residential Real Estate, Leasing Residential Real Estate, Real Estate Agents and Brokers, Real Estate and Equipment Rental Services, Subdivision of Land)
"Recreational Facilities & Services" (Includes: Recreational Facilities, Skiing Facilities)
"Religious Institutions"
"Renewables & Environment" (Includes: Biomass Electric Power Generation, Climate Technology Product Manufacturing, Conservation Programs, Environmental Quality Programs, Fuel Cell Manufacturing, Geothermal Electric Power Generation, Hydroelectric Power Generation, Renewable Energy Equipment Manufacturing, Renewable Energy Power Generation, Renewable Energy Semiconductor Manufacturing, Services for Renewable Energy, Solar Electric Power Generation, Wind Electric Power Generation)
"Research" (Includes: Nanotechnology Research, Research Services)
"Restaurants"
"Retail" (Includes: Food and Beverage Retail, Online and Mail Order Retail, Retail Apparel and Fashion, Retail Appliances, Electrical, and Electronic Equipment, Retail Art Dealers, Retail Art Supplies, Retail Books and Printed News, Retail Building Materials and Garden Equipment, Retail Florists, Retail Furniture and Home Furnishings, Retail Gasoline, Retail Groceries, Retail Health and Personal Care Products, Retail Luxury Goods and Jewelry, Retail Motor Vehicles, Retail Office Equipment, Retail Office Supplies and Gifts, Retail Pharmacies, Retail Recyclable Materials & Used Merchandise)
"Savings Institutions"
"Security & Investigations" (Includes: Security Guards and Patrol Services, Security Systems Services)
"Semiconductors"
"Shipbuilding"
"Sporting Goods" (Includes: Sporting Goods Manufacturing)
"Sports" (Includes: Golf Courses and Country Clubs, Racetracks, Spectator Sports, Sports Teams and Clubs, Sports and Recreation Instruction)
"Staffing & Recruiting" (Includes: Executive Search Services, Staffing and Recruiting, Temporary Help Services)
"Supermarkets" (Includes: Retail Groceries)
"Telecommunications" (Includes: Media and Telecommunications, Satellite Telecommunications, Telecommunications Carriers, Wireless, Wireless Services)
"Textiles" (Includes: Textile Manufacturing)
"Think Tanks"
"Translation & Localization" (Includes: Translation and Localization)
"Transportation/Trucking/Railroad" (Includes: Interurban and Rural Bus Services, Pipeline Transportation, Rail Transportation, School and Employee Bus Services, Shuttles and Special Needs Transportation Services, Taxi and Limousine Services, Transportation Equipment Manufacturing, Transportation Programs, Transportation, Logistics, Supply Chain and Storage, Truck Transportation, Urban Transit Services)
"Utilities" (Includes: Electric Power Generation, Electric Power Transmission, Control, and Distribution, Nuclear Electric Power Generation, Steam and Air-Conditioning Supply, Waste Collection, Waste Treatment and Disposal, Water Supply and Irrigation Systems, Water, Waste, Steam, and Air Conditioning Services)
"Venture Capital & Private Equity" (Includes: Venture Capital and Private Equity Principals)
"Veterinary" (Includes: Veterinary Services)
"Warehousing" (Includes: Warehousing and Storage)
"Wholesale" (Includes: Parts Distribution, Wholesale Apparel and Sewing Supplies, Wholesale Appliances, Electrical, and Electronics, Wholesale Building Materials, Wholesale Chemical and Allied Products, Wholesale Computer Equipment, Wholesale Food and Beverage, Wholesale Footwear, Wholesale Furniture and Home Furnishings, Wholesale Hardware, Plumbing, Heating Equipment, Wholesale Import and Export, Wholesale Luxury Goods and Jewelry, Wholesale Machinery, Wholesale Metals and Minerals, Wholesale Motor Vehicles and Parts, Wholesale Paper Products, Wholesale Petroleum and Petroleum Products, Wholesale Photography Equipment and Supplies, Wholesale Raw Farm Products, Wholesale Recyclable Materials)
"Wireless" (Includes: Wireless Services)
"Writing & Editing" (Includes: Artists and Writers, Blogs, Writing and Editing)
If searching globally, use ONLY the Main Industry names.
If searching in MENA, you can use the Main Industry names AND/OR the Sub Industry names..

For exclusions (e.g., "excluding agencies", "not from Oracle"), place those values in the "exclude" array of the appropriate filter.
Return ONLY valid JSON. No markdown formatting, no explanations.`;

    const response = await axios.post(
      "https://api.deepseek.com/chat/completions",
      {
        model: "deepseek-chat",
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Convert this query to JSON filters: "${query}"\n\nEnsure output conforms to this JSON schema:\n${JSON.stringify(schema, null, 2)}` }
        ],
        response_format: { type: "json_object" }
      },
      {
        headers: {
          "Authorization": `Bearer ${deepseekApiKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    const resultText = response.data.choices[0].message.content;
    const parsedData = JSON.parse(resultText);
    const parsedFilters = parsedData.filters || {};
    const isSemanticNeeded = parsedData.is_semantic_needed || false;
    const semanticSentences = parsedData.semantic_sentences || [];

    // Provide includes/excludes arrays & labels so frontend FilterPanel directly accepts it
    const finalFilters = {};
    for (const [key, value] of Object.entries(parsedFilters)) {
      if (!value) continue;
      
      if (typeof value === "object" && !Array.isArray(value)) {
        if (value.min !== undefined || value.max !== undefined) {
           finalFilters[key] = { min: value.min, max: value.max };
           continue;
        }

        const include = Array.isArray(value.include) ? value.include : [];
        const exclude = Array.isArray(value.exclude) ? value.exclude : [];
        
        if (include.length > 0 || exclude.length > 0) {
          finalFilters[key] = {
            include,
            exclude,
            includes: include,
            excludes: exclude,
            // For static lists, frontend backfills labels, but we can seed it with the same text
            includeLabels: include.reduce((acc, val) => ({ ...acc, [val]: val }), {}),
            excludeLabels: exclude.reduce((acc, val) => ({ ...acc, [val]: val }), {})
          };
        }
      } else if (typeof value === "string" && value.trim() !== "") {
        finalFilters[key] = value;
      }
    }

    return res.status(200).json({ 
      filters: finalFilters,
      isSemanticNeeded,
      semanticSentences
    });

  } catch (error) {
    console.error("AI Parse Filters Error:", error.response?.data || error.message);
    return res.status(500).json({ msg: "Failed to parse filters", error: error.message });
  }
};
