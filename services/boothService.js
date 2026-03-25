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
  const validBaseCats = ["Farmer", "Worker", "Student", "Senior Citizen", "Women"];
  
  const predictions = new Array(voters.length);
  const votersToML = [];

  // 1. Direct mapping for known DB occupations
  voters.forEach((voter, idx) => {
    let primaryCat = validBaseCats.includes(voter.occupation) ? voter.occupation : null;
    if (!primaryCat && voter.category && validBaseCats.includes(voter.category)) primaryCat = voter.category;
    
    // Explicit override for "Senior Citizen" if age > 60
    if (!primaryCat && voter.age > 60) primaryCat = "Senior Citizen";

    if (primaryCat) {
      const scores = { Farmer: 0, Worker: 0, Student: 0, "Senior Citizen": 0, Women: 0, Others: 0 };
      scores[primaryCat] = 1;
      
      predictions[idx] = {
        category: primaryCat,
        confidence: 1.0,
        scores,
      };
    } else {
      votersToML.push({ voter, idx });
    }
  });

  const mlHealthy = await isServiceHealthy();

  if (votersToML.length > 0) {
    if (mlHealthy) {
      console.log(`Using ML classifier for ${votersToML.length} voters`);
      try {
        const voterPayloads = votersToML.map(({ voter }) => ({
          age: voter.age,
          gender: voter.gender || "Other",
          area_type: voter.area_type || context?.areaType || "Urban",
          issue: context?.issue || "",
        }));

        const mlPredictions = await classifyVoters(voterPayloads);
        votersToML.forEach(({ idx }, i) => {
          predictions[idx] = mlPredictions[i];
        });

      } catch (err) {
        console.warn("ML classification failed, falling back to rule-based engine:", err.message);
        const fallbackPredictions = fallbackClassify(votersToML.map(v => v.voter), context);
        votersToML.forEach(({ idx }, i) => {
          predictions[idx] = fallbackPredictions[i];
        });
      }
    } else {
      console.log(`ML service unavailable -- using rule-based fallback for ${votersToML.length} voters`);
      const fallbackPredictions = fallbackClassify(votersToML.map(v => v.voter), context);
      votersToML.forEach(({ idx }, i) => {
        predictions[idx] = fallbackPredictions[i];
      });
    }
  }

  return {
    predictions,
    engineInfo: {
      engine: votersToML.length === 0 ? "db-mapping" : (mlHealthy ? "hybrid-ml" : "fallback-rules"),
      status: "active",
      message: `Directly mapped ${voters.length - votersToML.length} voters from DB. Analyzed ${votersToML.length} remaining voters using AI.`,
    },
  };
};

/**
 * Rule-based classification fallback (original categoryEngine logic).
 */
const fallbackClassify = (voters, context) => {
  return voters.map((voter) => {
    const area = voter.area_type || context?.areaType || "Urban";
    const baseScores = getBaseScores(voter.age, area);
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

  // Step 4: Feed voter profiles into the Personalized Recommender (v2)
  // Pipeline: Strict pre-filters (date, gender, occupation, area) →
  //           Weighted scoring (interest, age, priority, genderFit, diversity) →
  //           Diversity control (cluster dedup) → Top-3 ranked output
  const processed = await Promise.all(
    voters.map(async (voter, index) => {
      const { category, confidence, scores } = classifications[index];

      const voterInterests = Array.isArray(voter.interests)
        ? voter.interests
        : (typeof voter.interests === 'string' ? [voter.interests] : []);

      const recommendedSchemes = await getRecommendedSchemes(
        scores,                                // full ML probability distribution
        boothIssue,                            // booth-level issue context
        voter.gender,                          // gender for hard filter + scoring
        voter.age,                             // age (reserved for future rules)
        voterInterests,                        // interest matching
        voter.occupation || '',                // occupation matching
        voter.area_type || context?.areaType || "Rural",  // area matching
        3,                                     // top 3 most relevant schemes
        voter.incomeRange,                     // income bracket (Lower, Middle, Higher)
        voter.pwdStatus,                       // Person with Disability status
        voter.bplStatus,                       // Below Poverty Line status
        voter.scstStatus                       // SC/ST status
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
    // Override the ML category to literally match the DB occupation if it's one of our strict categories!
    const validBaseCats = ["Farmer", "Worker", "Student", "Senior Citizen"];
    const primaryCat = validBaseCats.includes(v.occupation) ? v.occupation : v.category;
    v.category = primaryCat;

    // 1. Group by primary generated category
    if (!grouped[v.category]) {
      grouped[v.category] = [];
    }
    grouped[v.category].push(v);
    
    // 2. Add female voters to the precise distinct "Women" category
    if (v.gender && v.gender.toLowerCase() === 'female') {
      if (!grouped["Women"]) {
        grouped["Women"] = [];
      }
      grouped["Women"].push(v);
    }
  });

  return {
    grouped,
    classificationEngine: engineInfo,
    context,
    voters: processed,
  };
};

module.exports = { processBoothData };

