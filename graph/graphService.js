/**
 * SAMVAD — Knowledge Graph Recommendation Engine
 * =================================================
 * An in-memory weighted knowledge graph that maps ML classification
 * probability scores to relevant government schemes through multi-category
 * traversal and aggregated relevance scoring.
 *
 * Graph Structure:
 *   CATEGORY NODES ──edge(weight)──> SCHEME NODES
 *
 *   - Category nodes: Student, Worker, Farmer, Senior, Others
 *   - Scheme nodes:   Each government scheme loaded from DB
 *   - Edge weights:   How relevant a scheme is to a particular category
 *                     (1.0 = primary match, 0.3-0.7 = cross-category relevance)
 *
 * Recommendation Algorithm:
 *   For each voter with ML scores { Student: 0.65, Worker: 0.25, Farmer: 0.10, ... }
 *   and for each scheme S in the graph:
 *
 *     relevance(S) = SUM over all categories C of:
 *         ml_score(C) * edge_weight(C, S) * issue_boost(S) * deadline_factor(S)
 *
 *   Return top-N schemes sorted by relevance score.
 */

const Scheme = require("../models/Scheme");

// ─── Category Normalization ────────────────────────────────────────
// Maps scheme DB categories to the ML model's output categories.
// Some schemes use "Unemployed Youth" or "Senior Citizen" — we map those
// to our ML categories so edges can be created.

const SCHEME_TO_ML_CATEGORY = {
  Student: "Student",
  Worker: "Worker",
  Farmer: "Farmer",
  Senior: "Senior",
  Women: "Women",  // Special handling — not an ML output category
};

// ─── Cross-Category Relevance Weights ──────────────────────────────
// Defines how strongly a scheme from one category should also connect
// to other categories. This captures the real-world truth that schemes
// aren't strictly siloed. For example, a Worker skill development scheme
// is also partially relevant to Students.
//
// Format: CROSS_WEIGHTS[schemeCategory][mlCategory] = weight
// A weight of 1.0 means the scheme is a direct match for that ML category.

const CROSS_WEIGHTS = {
  Student: {
    Student: 1.0,
    Worker: 0.3,    // Some student schemes help workers too
    Farmer: 0.05,
    Senior: 0.0,
    Others: 0.15,
  },
  Worker: {
    Student: 0.25,  // Young workers benefit from worker schemes
    Worker: 1.0,
    Farmer: 0.2,    // Rural workers overlap with farmer needs
    Senior: 0.15,   // Some worker schemes cover elderly workers
    Others: 0.2,
  },
  Farmer: {
    Student: 0.05,
    Worker: 0.15,   // Agricultural workers
    Farmer: 1.0,
    Senior: 0.2,    // Elderly farmers still farm
    Others: 0.1,
  },
  Senior: {
    Student: 0.0,
    Worker: 0.1,
    Farmer: 0.1,
    Senior: 1.0,
    Others: 0.15,
  },

  Women: {
    // Women schemes have a special gender-based pathway, not ML-score-based.
    // These weights are used ONLY for female voters as a bonus.
    Student: 0.4,
    Worker: 0.4,
    Farmer: 0.3,
    Senior: 0.3,
    Others: 0.3,
  },
};

// ─── Occupation + Interest Mapping ─────────────────────────────────
// These maps are used to adjust scheme relevance when voter occupation
// or interests strongly align with scheme category or issue keywords.
const OCCUPATION_CATEGORY_MAP = {
  Student: "Student",
  Worker: "Worker",
  Farmer: "Farmer",
  'Senior Citizen': "Senior",
};

const INTEREST_TO_SCHEME_ISSUES = {
  technology: ["Skill Development", "Job Opportunities", "Education Support"],
  coding: ["Skill Development", "Job Opportunities"],
  career: ["Job Opportunities", "Skill Development"],
  finance: ["Financial Literacy", "Job Opportunities"],
  travel: ["Labor Support", "Mobility Support"],
  sports: ["Healthcare", "Wellness"],
  fitness: ["Healthcare", "Wellness"],
  community: ["Community Welfare", "Women Welfare"],
  'community service': ["Community Welfare", "Social Support"],
  gardening: ["Agriculture Support", "Environment"],
  agriculture: ["Agriculture Support", "Irrigation"],
  livestock: ["Agriculture Support", "Rural Welfare"],
  nature: ["Environment", "Agriculture Support"],
  reading: ["Education Support", "Cultural"],
  music: ["Culture", "Education Support"],
  arts: ["Culture", "Education Support"],
  family: ["Family Welfare", "Social Security"],
  crafts: ["Skill Development", "Artisan Support"],
  health: ["Healthcare", "Wellness"],
  walking: ["Healthcare", "Wellness"],
};

// ─── Issue Relevance Mapping ───────────────────────────────────────
// Maps booth issue keywords to scheme issue categories for boosting.
const ISSUE_KEYWORD_MAP = {
  "job": ["Job Opportunities", "Skill Development", "Labor Support"],
  "skill": ["Skill Development", "Job Opportunities"],
  "student": ["Skill Development", "Job Opportunities"],
  "youth": ["Skill Development", "Job Opportunities"],
  "agriculture": ["Agriculture Support", "Irrigation"],
  "irrigation": ["Irrigation", "Agriculture Support"],
  "farmer": ["Agriculture Support", "Irrigation"],
  "health": ["Healthcare"],
  "senior": ["Healthcare", "Pension"],
  "pension": ["Pension", "Healthcare"],
  "road": ["Labor Support"],
  "electricity": ["Labor Support"],
  "startup": ["Job Opportunities"],
  "entrepreneur": ["Job Opportunities"],
  "transport": ["Labor Support"],
  "waste": ["Healthcare"],
  "sanitation": ["Healthcare"],
  "women": ["Women Welfare", "Healthcare"],
  "maternal": ["Women Welfare", "Healthcare"],
};

// ─── Knowledge Graph Class ─────────────────────────────────────────

class KnowledgeGraph {
  constructor() {
    this.schemes = [];       // All scheme documents from DB
    this.edges = new Map();  // Map<scheme_id, Map<mlCategory, weight>>
    this.isBuilt = false;
  }

  /**
   * Build the graph by loading all schemes from the database and
   * creating weighted edges between ML categories and schemes.
   */
  async build() {
    console.log("[KnowledgeGraph] Building graph from scheme database...");

    this.schemes = await Scheme.find({}).lean();
    this.edges = new Map();

    for (const scheme of this.schemes) {
      const schemeCategory = scheme.category;
      const crossWeights = CROSS_WEIGHTS[schemeCategory];

      if (!crossWeights) {
        // Unknown category — create weak connections to all
        const weakEdges = new Map();
        for (const mlCat of ["Student", "Worker", "Farmer", "Senior", "Others"]) {
          weakEdges.set(mlCat, 0.1);
        }
        this.edges.set(scheme.scheme_id, weakEdges);
        continue;
      }

      // Create weighted edges from each ML category to this scheme
      const edgeMap = new Map();
      for (const [mlCat, weight] of Object.entries(crossWeights)) {
        edgeMap.set(mlCat, weight);
      }
      this.edges.set(scheme.scheme_id, edgeMap);
    }

    this.isBuilt = true;
    console.log(`[KnowledgeGraph] Graph built: ${this.schemes.length} scheme nodes, ${this.edges.size * 5} edges`);
  }

  /**
   * Ensure the graph is built (lazy initialization).
   */
  async ensureBuilt() {
    if (!this.isBuilt) {
      await this.build();
    }
  }

  /**
   * Compute the issue relevance boost for a scheme given the booth issue text.
   * Returns a multiplier (1.0 = no boost, up to 1.5 = strong boost).
   */
  _computeIssueBoost(scheme, boothIssue) {
    if (!boothIssue) return 1.0;

    const issueLower = boothIssue.toLowerCase();
    const schemeIssue = (scheme.issue_targeted || "").toLowerCase();

    // Direct match: booth issue text contains the scheme's target issue
    if (issueLower.includes(schemeIssue) && schemeIssue !== "") {
      return 1.2; // Reduced from 1.5 — category edge weights should dominate
    }

    // Keyword-based partial match
    for (const [keyword, relevantIssues] of Object.entries(ISSUE_KEYWORD_MAP)) {
      if (issueLower.includes(keyword)) {
        const matchesSchemeIssue = relevantIssues.some(
          (ri) => ri.toLowerCase() === schemeIssue
        );
        if (matchesSchemeIssue) return 1.1; // Reduced from 1.3
      }
    }

    return 1.0;
  }

  /**
   * Compute occupation relevance boost.
   */
  _computeOccupationBoost(scheme, voterOccupation) {
    if (!voterOccupation) return 1.0;

    const schemeCategory = scheme.category || "";
    const normalized = OCCUPATION_CATEGORY_MAP[voterOccupation] || "";
    if (normalized && schemeCategory === normalized) {
      return 1.25;
    }

    // To avoid overshooting, tie Worker-based occupation to related categories.
    if (normalized === "Worker" && ["Student", "Farmer"].includes(schemeCategory)) {
      return 1.05;
    }

    return 1.0;
  }

  /**
   * Compute Interest-based boost. Matches voter interests with scheme issue/description.
   */
  _computeInterestBoost(scheme, voterInterests) {
    if (!voterInterests || !voterInterests.length) return 1.0;

    const schemeText = `${scheme.scheme_name || ""} ${scheme.issue_targeted || ""} ${scheme.description || ""}`.toLowerCase();

    let bonus = 1.0;
    for (const interest of voterInterests) {
      const normalizedInterest = interest.toLowerCase();

      if (schemeText.includes(normalizedInterest)) {
        bonus = Math.max(bonus, 1.25);
      } else if (INTEREST_TO_SCHEME_ISSUES[normalizedInterest]) {
        const mapIssues = INTEREST_TO_SCHEME_ISSUES[normalizedInterest].map((i) => i.toLowerCase());
        const schemeIssue = (scheme.issue_targeted || "").toLowerCase();
        if (mapIssues.some((i) => schemeIssue.includes(i))) {
          bonus = Math.max(bonus, 1.2);
        }
      }
    }

    return bonus;
  }

  /**
   * Compute a deadline proximity factor.
   * Schemes with approaching deadlines get a slight boost (urgency signal).
   * Returns a multiplier between 1.0 and 1.2.
   */
  _computeDeadlineFactor(scheme) {
    if (!scheme.deadline) return 1.0;

    const now = new Date();
    const deadline = new Date(scheme.deadline);
    const daysUntil = (deadline - now) / (1000 * 60 * 60 * 24);

    if (daysUntil < 0) return 0.5;       // Expired — penalize
    if (daysUntil <= 90) return 1.2;      // Urgent — slight boost
    if (daysUntil <= 180) return 1.1;     // Approaching — minor boost
    return 1.0;
  }

  /**
   * ══════════════════════════════════════════════════════════════
   * CORE RECOMMENDATION ENGINE
   * ══════════════════════════════════════════════════════════════
   *
   * Given ML probability scores for a voter, traverse ALL category
   * edges in the graph, compute aggregated relevance for each scheme,
   * and return the top N most relevant schemes.
   *
   * @param {Object} mlScores - ML probability distribution
   *   e.g. { Student: 0.65, Worker: 0.25, Farmer: 0.08, Senior: 0.00, Others: 0.02 }
   * @param {Object} options - Additional context
   *   - boothIssue: string (booth issue text for relevance boosting)
   *   - gender: "Male"|"Female"|"Other" (for women scheme handling)
   *   - topN: number (how many schemes to return, default 3)
   * @returns {Array<Object>} Top N schemes with relevance scores and reasoning
   */
  async recommend(mlScores, options = {}) {
    await this.ensureBuilt();

    const { boothIssue = "", gender = "Other", age = 0, topN = 3 } = options;

    const schemeRelevanceScores = [];

    for (const scheme of this.schemes) {
      // Skip Women-only schemes for non-female voters
      if (scheme.category === "Women" && gender !== "Female") continue;

      // Age gate: JSSK is a maternity scheme for pregnant women — skip for 45+
      if (scheme.scheme_id === "SCH027" && age >= 45) continue;

      const edgeWeights = this.edges.get(scheme.scheme_id);
      if (!edgeWeights) continue;

      // ── Aggregated multi-category relevance ──
      // relevance = SUM( ml_score[cat] * edge_weight[cat→scheme] )
      let rawRelevance = 0;
      const contributingCategories = [];

      for (const [mlCat, mlScore] of Object.entries(mlScores)) {
        const edgeWeight = edgeWeights.get(mlCat) || 0;
        const contribution = mlScore * edgeWeight;

        if (contribution > 0.01) {
          rawRelevance += contribution;
          contributingCategories.push({
            category: mlCat,
            mlScore: mlScore,
            edgeWeight: edgeWeight,
            contribution: Number(contribution.toFixed(4)),
          });
        }
      }

      // Women bonus for female voters (additive, not replacing)
      if (gender === "Female" && scheme.category === "Women") {
        // Use the max ML score as a proxy for relevance
        const maxMlScore = Math.max(...Object.values(mlScores));
        const womenBonus = maxMlScore * 0.4;
        rawRelevance += womenBonus;
        contributingCategories.push({
          category: "Women (gender bonus)",
          mlScore: maxMlScore,
          edgeWeight: 0.4,
          contribution: Number(womenBonus.toFixed(4)),
        });
      }

      // ── Apply contextual multipliers ──
      const issueBoost = this._computeIssueBoost(scheme, boothIssue);
      const deadlineFactor = this._computeDeadlineFactor(scheme);
      const occupationBoost = this._computeOccupationBoost(scheme, options.occupation);
      const interestBoost = this._computeInterestBoost(scheme, options.interests);

      const finalRelevance = rawRelevance * issueBoost * deadlineFactor * occupationBoost * interestBoost;

      if (finalRelevance > 0) {
        schemeRelevanceScores.push({
          scheme_id: scheme.scheme_id,
          scheme_name: scheme.scheme_name,
          category: scheme.category,
          issue_targeted: scheme.issue_targeted,
          description: scheme.description,
          deadline: scheme.deadline,
          _id: scheme._id,
          relevanceScore: Number(finalRelevance.toFixed(4)),
          reasoning: {
            rawRelevance: Number(rawRelevance.toFixed(4)),
            issueBoost,
            deadlineFactor,
            contributingCategories,
          },
        });
      }
    }

    // Sort by relevance score (descending) and return top N
    schemeRelevanceScores.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return schemeRelevanceScores.slice(0, topN);
  }
}

// ─── Singleton Instance ────────────────────────────────────────────
// The graph is built once and shared across all requests.
const knowledgeGraph = new KnowledgeGraph();

// ─── Exported API ──────────────────────────────────────────────────

/**
 * Get scheme recommendations for a voter using multi-category graph traversal.
 *
 * @param {Object} mlScores - Full ML probability distribution
 * @param {string} boothIssue - Booth issue text
 * @param {string} gender - Voter's gender
 * @param {number} topN - Number of schemes to return
 * @returns {Array<Object>} Ranked scheme recommendations with relevance scores
 */
const getRecommendedSchemes = async (mlScores, boothIssue = "", gender = "Other", age = 0, interests = [], occupation = "", topN = 3) => {
  return knowledgeGraph.recommend(mlScores, {
    boothIssue,
    gender,
    age,
    interests,
    occupation,
    topN,
  });
};

/**
 * Force rebuild the knowledge graph (e.g., after scheme data changes).
 */
const rebuildGraph = async () => {
  knowledgeGraph.isBuilt = false;
  await knowledgeGraph.build();
};

// Legacy compatibility — still works if called from old code
const getSchemesFromCategoryAndIssue = async (category) => {
  const normalizedCategory = SCHEME_TO_ML_CATEGORY[category]
    ? category
    : Object.keys(SCHEME_TO_ML_CATEGORY).find(
        (k) => SCHEME_TO_ML_CATEGORY[k] === category
      ) || category;

  try {
    return await Scheme.find({ category: normalizedCategory }).lean();
  } catch (error) {
    console.error(error);
    return [];
  }
};

module.exports = {
  getRecommendedSchemes,
  getSchemesFromCategoryAndIssue,
  rebuildGraph,
};
