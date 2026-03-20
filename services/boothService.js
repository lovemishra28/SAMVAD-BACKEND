/**
 * SAMVAD -- Booth Processing Service
 * ====================================
 * Fetches voters for a booth, classifies them using the ML model,
 * and maps them to relevant government schemes via the Knowledge Graph.
 *
 * Pipeline:
 *   1. Fetch voters + booth context from MongoDB
 *   2. Classify all voters (ML model or rule-based fallback)
 *   3. Feed FULL probability distributions into the Knowledge Graph
 *   4. Knowledge Graph performs multi-category weighted traversal
 *   5. Return voters grouped by category with ranked scheme recommendations
 *
 * The key upgrade: schemes are no longer picked from a single category.
 * Instead, the graph aggregates relevance scores across ALL categories
 * weighted by the ML confidence, producing more accurate and personalized
 * recommendations.
 */

const { getRecommendedSchemes } = require("../graph/graphService");
const Voter = require("../models/Voter");
const Context = require("../models/Context");
const { classifyVoters, isServiceHealthy } = require("../ml/classifier");
const { getBaseScores, applyContextBoost, getFinalCategoryAndConfidence } = require("../utils/categoryEngine");

// ─── Classification Layer ──────────────────────────────────────────

/**
 * Classify voters using the ML service. Falls back to rule-based engine
 * if the ML service is unavailable.
 *
 * @param {Array} voters - Array of voter documents from MongoDB
 * @param {Object} context - Booth context document (issue, areaType)
 * @returns {{ predictions: Array<Object>, engineInfo: Object }}
 */
const classifyVotersBatch = async (voters, context) => {
  const mlHealthy = await isServiceHealthy();

  if (mlHealthy) {
    console.log("Using ML classifier for voter classification");

    try {
      const voterPayloads = voters.map((voter) => ({
        age: voter.age,
        gender: voter.gender || "Other",
        area_type: context?.areaType || "Urban",
        issue: context?.issue || "",
      }));

      const predictions = await classifyVoters(voterPayloads);
      return {
        predictions,
        engineInfo: {
          engine: "ml",
          status: "active",
          message: "Classification powered by ML model (Gradient Boosted Classifier with calibrated probabilities)",
        },
      };
    } catch (err) {
      console.warn("ML classification failed, falling back to rule-based engine:", err.message);
      return {
        predictions: fallbackClassify(voters, context),
        engineInfo: {
          engine: "rule-based",
          status: "fallback",
          message: "ML service encountered an error -- using rule-based classification as fallback",
          reason: err.message,
        },
      };
    }
  } else {
    console.log("ML service unavailable -- using rule-based fallback");
    return {
      predictions: fallbackClassify(voters, context),
      engineInfo: {
        engine: "rule-based",
        status: "fallback",
        message: "ML service is not running -- using rule-based classification as fallback",
        reason: "ML service health check failed (is classifier_service.py running?)",
      },
    };
  }
};

/**
 * Rule-based classification fallback (original categoryEngine logic).
 */
const fallbackClassify = (voters, context) => {
  return voters.map((voter) => {
    const baseScores = getBaseScores(voter.age);
    const updatedScores = applyContextBoost(baseScores, context?.issue || "", voter.gender);
    const confidence = Math.max(...Object.values(updatedScores));
    const { finalCategory: category } = getFinalCategoryAndConfidence(updatedScores);

    const total = Object.values(updatedScores).reduce((a, b) => a + b, 0) || 1;
    const scores = {};
    for (const key in updatedScores) {
      scores[key] = Number((updatedScores[key] / total).toFixed(4));
    }
    if (!scores.Others) scores.Others = 0;

    return { category, confidence: Number((confidence / total).toFixed(4)), scores };
  });
};

// ─── Main Processing Pipeline ──────────────────────────────────────

/**
 * Main booth processing pipeline.
 * @param {string} boothId - The booth identifier
 * @returns {Object} - { grouped, classificationEngine }
 */
const processBoothData = async (boothId) => {
  // Step 1: Fetch voters from DB
  const voters = await Voter.find({ boothId }).lean();

  // Step 2: Fetch context for this booth
  const context = await Context.findOne({ boothId });
  const boothIssue = context?.issue || "";

  // Step 3: Classify all voters (ML or fallback)
  const { predictions: classifications, engineInfo } = await classifyVotersBatch(voters, context);

  // Step 4: Feed scores into Knowledge Graph for multi-category recommendations
  const processed = await Promise.all(
    voters.map(async (voter, index) => {
      const { category, confidence, scores } = classifications[index];

      // Knowledge Graph traversal using FULL probability distribution
      // This is the key improvement: instead of passing only the top category,
      // we pass the entire score distribution so the graph can weigh schemes
      // from ALL relevant categories.
      const recommendedSchemes = await getRecommendedSchemes(
        scores,
        boothIssue,
        voter.gender,
        voter.age,
        3 // Top 3 recommendations
      );

      return {
        ...voter,
        category,
        gender: voter.gender,
        confidence,
        scores,
        schemes: recommendedSchemes,
      };
    })
  );

  // Step 5: Group by category
  const grouped = {};
  processed.forEach((v) => {
    if (!grouped[v.category]) {
      grouped[v.category] = [];
    }
    grouped[v.category].push(v);
  });

  return {
    grouped,
    classificationEngine: engineInfo,
    context,
    voters: processed,
  };
};

module.exports = { processBoothData };
