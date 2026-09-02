const SavedFilter = require("../models/SavedFilter");
const SearchSnapshot = require("../models/SearchSnapshot");
const User = require("../models/User");
const axios = require("axios");

const getMiddlewareConfig = () => {
  const middlewareUrl = process.env.MAWSOOL_SEARCH_API || "http://localhost:3001";
  const middlewareKey = process.env.MAWSOOL_MIDDLEWARE_KEY || "mawsool_internal_a5d6d56f4227fbc84a09e859d06bc4d6";
  return { middlewareUrl, middlewareKey };
};

const isMenaSnapshotEligible = async ({ filters, seed }) => {
  const { middlewareUrl, middlewareKey } = getMiddlewareConfig();
  const response = await axios.post(`${middlewareUrl}/search`, {
    filters,
    page: 1,
    limit: 1,
    type: "people",
    seed
  }, {
    headers: { "x-api-key": middlewareKey },
    timeout: 60000
  });
  const items = response?.data?.items || [];
  const first = items[0];
  return first && first._source === "MENA";
};

const buildSearchSnapshot = async ({ savedFilterId, userId, filters }) => {
  const seed = `snapshot_${savedFilterId}`;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await SearchSnapshot.findOneAndUpdate(
    { userId, savedFilterId },
    { status: "building", publicIds: [], totalCount: 0, originalTotalCount: 0, error: "", expiresAt, createdAt: new Date() },
    { upsert: true, new: true }
  );

  const eligible = await isMenaSnapshotEligible({ filters, seed });
  if (!eligible) {
    await SearchSnapshot.findOneAndUpdate(
      { userId, savedFilterId },
      { status: "failed", publicIds: [], totalCount: 0, error: "not_mena", expiresAt },
      { upsert: true, new: true }
    );
    return;
  }

  const { middlewareUrl, middlewareKey } = getMiddlewareConfig();
  const maxIds = 1000;
  const pageSize = 100;
  const maxPages = Math.ceil(maxIds / pageSize);
  const seen = new Set();
  const publicIds = [];
  let originalTotalCount = 0;

  for (let page = 1; page <= maxPages && publicIds.length < maxIds; page += 1) {
    const response = await axios.post(`${middlewareUrl}/search`, {
      filters,
      page,
      limit: pageSize,
      type: "people",
      seed
    }, {
      headers: { "x-api-key": middlewareKey },
      timeout: 120000
    });

    const items = response?.data?.items || [];
    if (page === 1) {
      const t = response?.data?.paging?.total_count;
      const n = typeof t === "number" ? t : parseInt(String(t || "0"), 10);
      if (Number.isFinite(n) && n > 0) originalTotalCount = n;
    }
    if (!Array.isArray(items) || items.length === 0) break;

    for (const item of items) {
      const pid = typeof item?.id === "string" ? item.id : (typeof item?.public_id === "string" ? item.public_id : "");
      if (!pid) continue;
      if (seen.has(pid)) continue;
      seen.add(pid);
      publicIds.push(pid);
      if (publicIds.length >= maxIds) break;
    }
  }

  await SearchSnapshot.findOneAndUpdate(
    { userId, savedFilterId },
    { status: "ready", publicIds, totalCount: publicIds.length, originalTotalCount: originalTotalCount || publicIds.length, error: "", expiresAt },
    { upsert: true, new: true }
  );
};

// Create a new filter
// Create a new filter
exports.createFilter = async (req, res) => {
  try {
    // console.log("Create filter request body:", req.body);
    // console.log("User ID:", req.user);
    
    const { filterName, filters } = req.body;
    const userId = req.user.sub || req.user.id || req.user._id;

    const userDoc = await User.findById(userId).populate('orgId', 'planKey').lean();
    const planKey = String(userDoc?.planKey || userDoc?.orgId?.planKey || "FREE").toUpperCase();
    if (planKey === "FREE") {
      return res.status(403).json({ msg: "Please upgrade your plan to use Save Search." });
    }
    
    // console.log("Extracted values:", { userId, filterName, typeof: filters });

    if (!filterName || !filters) {
      return res.status(400).json({ msg: "Filter name and content are required" });
    }

    // Check if a filter with this name already exists for this user
    const existingFilter = await SavedFilter.findOne({ 
      userId, 
      filterName: filterName 
    });

    if (existingFilter) {
      return res.status(400).json({ 
        msg: `A filter named "${filterName}" already exists for your account` 
      });
    }

    // Create new filter
    const newFilter = new SavedFilter({
      userId,
      filterName,
      filters
    });
    
    const savedFilter = await newFilter.save();
    // console.log("Filter saved successfully:", savedFilter);
    
    res.status(201).json({ 
      msg: "Filter created successfully", 
      data: savedFilter
    });

    setImmediate(() => {
      Promise.resolve()
        .then(() => buildSearchSnapshot({ savedFilterId: savedFilter._id, userId, filters }))
        .catch(async (err) => {
          try {
            const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            await SearchSnapshot.findOneAndUpdate(
              { userId, savedFilterId: savedFilter._id },
              { status: "failed", error: String(err?.message || err), expiresAt },
              { upsert: true }
            );
          } catch {}
        });
    });
  } catch (err) {
    console.error("Filter creation error:", err);
    res.status(500).json({ 
      msg: "Server error", 
      error: err.message,
      stack: err.stack 
    });
  }
};
// Delete a filter
exports.deleteFilter = async (req, res) => {
  const userId = req.user.sub || req.user.id || req.user._id;

  try {
    const result = await SavedFilter.findOneAndDelete({ userId });
    
    if (!result) {
      return res.status(404).json({ msg: "No filter found to delete" });
    }
    
    res.status(200).json({ msg: "Filter deleted successfully" });
  } catch (err) {
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};

// Save or update filter
exports.saveFilter = async (req, res) => {
  const { filters } = req.body;
  const userId = req.user.sub || req.user.id || req.user._id; 

  if (!filters || typeof filters !== "object") {
    return res.status(400).json({ msg: "Filters are required" });
  }

  try {
    const userDoc = await User.findById(userId).populate('orgId', 'planKey').lean();
    const planKey = String(userDoc?.planKey || userDoc?.orgId?.planKey || "FREE").toUpperCase();
    if (planKey === "FREE") {
      return res.status(403).json({ msg: "Please upgrade your plan to use Save Search." });
    }

    const updated = await SavedFilter.findOneAndUpdate(
      { userId },
      { filters, $setOnInsert: { createdAt: new Date() }, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    res.status(200).json({ msg: "Filter saved successfully", data: updated });
  } catch (err) {
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};

// Fetch saved filter for a user
// exports.getFilter = async (req, res) => {
//   const userId = req.user.sub || req.user.id || req.user._id; 
//   console.log(userId)

//   try {
//     const filter = await SavedFilter.findOne({ userId });

//     if (!filter) {
//       return res.status(404).json({ msg: "No saved filter found" });
//     }

//     res.status(200).json({ data: filter });
//   } catch (err) {
//     res.status(500).json({ msg: "Server error", error: err.message });
//   }
// };

// Fetch saved filters for a user
exports.getFilter = async (req, res) => {
  const userId = req.user.sub || req.user.id || req.user._id;
  // console.log("Getting filters for user:", userId);

  try {
    // Find all filters for this user
    const filters = await SavedFilter.find({ userId });
    // console.log(`Found ${filters.length} filters for user`);

    if (!filters || filters.length === 0) {
      return res.status(404).json({ msg: "No saved filters found" });
    }

    // Return the array of filter documents directly
    res.status(200).json({ 
      data: filters  // Return the entire array of filter documents
    });
  } catch (err) {
    console.error("Error fetching filters:", err);
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};

exports.buildSearchSnapshot = buildSearchSnapshot;
