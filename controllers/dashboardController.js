const { processBoothData } = require("../services/boothService");
const { buildSegments, buildSummary } = require("../services/insightService");
const { getRecommendedSchemes } = require("../graph/graphService");

const averageScoresForVoters = (voters = []) => {
  if (!voters.length) return {};

  const sumScores = {};
  const count = voters.length;

  voters.forEach((voter) => {
    if (!voter.scores) return;
    for (const [cat, score] of Object.entries(voter.scores)) {
      sumScores[cat] = (sumScores[cat] || 0) + (typeof score === "number" ? score : Number(score) || 0);
    }
  });

  const avgScores = {};
  for (const [cat, total] of Object.entries(sumScores)) {
    avgScores[cat] = Number((total / count).toFixed(4));
  }
  return avgScores;
};

/**
 * GET /api/dashboard/:boothId
 * Returns full dashboard payload for the booth.
 */
const getDashboard = async (req, res) => {
  try {
    const { boothId } = req.params;
    if (!boothId) {
      return res.status(400).json({ success: false, message: "Missing boothId" });
    }

    const { grouped, classificationEngine, context, voters } = await processBoothData(boothId);
    const segments = buildSegments(grouped);
    const summary = buildSummary({ groupedByCategory: grouped, boothIssue: context?.issue });

    // Compute top scheme recommendations per category using average scores.
    const topSchemesByCategory = {};
    for (const [key, votersForCategory] of Object.entries(segments)) {
      if (!votersForCategory || votersForCategory.length === 0) {
        topSchemesByCategory[key] = [];
        continue;
      }

      const avgScores = averageScoresForVoters(votersForCategory);
      // Compute average age for this category group
      const avgAge = Math.round(votersForCategory.reduce((sum, v) => sum + (Number(v.age) || 0), 0) / votersForCategory.length);
      const groupInterests = votersForCategory[0]?.interests || [];
      let groupOccupation = votersForCategory[0]?.occupation || '';
      if (key === 'women') {
        groupOccupation = 'Women';
      }
      const groupAreaType = votersForCategory[0]?.area_type || "Rural";
      const schemes = await getRecommendedSchemes(
        avgScores,
        context?.issue || "",
        votersForCategory[0]?.gender || "Other",
        avgAge,
        Array.isArray(groupInterests) ? groupInterests : (groupInterests ? [groupInterests] : []),
        groupOccupation,
        groupAreaType,
        3
      );
      topSchemesByCategory[key] = schemes;
    }

    res.json({
      success: true,
      classificationEngine,
      segments,
      summary,
      topSchemesByCategory,
      raw: {
        context,
        voters,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to build dashboard data", error: error.message });
  }
};

module.exports = { getDashboard };