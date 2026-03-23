const Scheme = require("../models/Scheme");

/**
 * Convert a deadline string into days until deadline.
 * Returns a signed integer (negative if deadline passed).
 */
const getDaysUntilDeadline = (deadline) => {
  if (!deadline) return null;
  const now = new Date();
  const dt = new Date(deadline);
  if (Number.isNaN(dt.getTime())) return null;

  const diffMs = dt.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

/**
 * Compute a status string based on the deadline.
 * Uses the same naming expected by the frontend UI:
 *   - active: deadline far in the future
 *   - upcoming: deadline within ~30 days
 *   - closed: deadline passed
 *   - unknown: no deadline available
 */
const getSchemeStatus = (deadline) => {
  const days = getDaysUntilDeadline(deadline);
  if (days === null) return "unknown";
  if (days < 0) return "closed";
  if (days <= 30) return "upcoming";
  return "active";
};

/**
 * Map a scheme document into the API response shape.
 */
const formatScheme = (scheme) => {
  const daysUntilDeadline = getDaysUntilDeadline(scheme.end_date || scheme.deadline);
  const status = getSchemeStatus(scheme.end_date || scheme.deadline);

  return {
    // Preserve existing property names for frontend compatibility
    id: scheme.scheme_id,
    name: scheme.scheme_name,
    registrationDeadline: scheme.end_date || scheme.deadline,
    deadline: scheme.end_date || scheme.deadline,
    issue_targeted: scheme.target_interest || scheme.issue_targeted,
    scheme_id: scheme.scheme_id,
    scheme_name: scheme.scheme_name,
    category: scheme.target_occupation || scheme.category,
    description: scheme.description,
    status,
    daysUntilDeadline,
  };
};

const getSchemes = async (category) => {
  const filter = {};
  if (category) {
    // Allow passing either the ML category or the frontend category (case-insensitive)
    filter.$or = [
      { target_occupation: { $regex: new RegExp(`^${category}$`, "i") } },
      { category: { $regex: new RegExp(`^${category}$`, "i") } }
    ];
  }

  try {
    const schemes = await Scheme.find(filter).lean();
    if (!Array.isArray(schemes)) return [];
    return schemes.map(formatScheme);
  } catch (error) {
    console.error("SchemeService.getSchemes: DB fetch failed:", error);
    // Fallback set (if DB is down, still allow frontend to function)
    return [
      {
        id: "SCHEMAUTO-001",
        name: "PM-Kisan",
        category: "Farmers",
        description: "Fallback scheme list (DB unavailable)",
        status: "active",
        daysUntilDeadline: null,
      },
      {
        id: "SCHEMAUTO-002",
        name: "Skill India",
        category: "Students",
        description: "Fallback scheme list (DB unavailable)",
        status: "active",
        daysUntilDeadline: null,
      },
    ].map(formatScheme);
  }
};

const getSchemeById = async (schemeId) => {
  if (!schemeId) return null;
  const scheme = await Scheme.findOne({ scheme_id: schemeId }).lean();
  return scheme ? formatScheme(scheme) : null;
};

/**
 * Generates a new unique scheme_id like SCH001, SCH002, ...
 */
const generateNextSchemeId = async () => {
  const all = await Scheme.find({}, { scheme_id: 1 }).lean();
  const maxNum = all.reduce((acc, item) => {
    const match = String(item.scheme_id || "").match(/(\d+)$/);
    const num = match ? Number(match[1]) : 0;
    return Math.max(acc, num);
  }, 0);
  return `SCH${String(maxNum + 1).padStart(3, "0")}`;
};

const createScheme = async (payload) => {
  const schemeId = payload.scheme_id || (await generateNextSchemeId());
  const schemeDoc = await Scheme.create({
    scheme_id: schemeId,
    scheme_name: payload.scheme_name || payload.name || "",
    category: payload.category || "Others",
    issue_targeted: payload.issue_targeted || "",
    description: payload.description || "",
    deadline: payload.deadline || null,
  });
  return formatScheme(schemeDoc);
};

module.exports = {
  getDaysUntilDeadline,
  getSchemeStatus,
  getSchemes,
  getSchemeById,
  createScheme,
};
