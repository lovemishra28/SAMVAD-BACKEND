const { getSchemesFromCategoryAndIssue } = require("../graph/graphService");
const Voter = require("../models/Voter");
const Context = require("../models/Context");
const { getBaseScores, applyContextBoost, getFinalCategoryAndConfidence } = require("../utils/categoryEngine");

const processBoothData = async (boothId) => {
  // ?? Step 1: Fetch voters from DB
  const voters = await Voter.find({ boothId }).lean();

  // ?? Step 2: Fetch context for this booth
  const context = await Context.findOne({ boothId });
  const rawBoothIssues = (context?.issue || "").toLowerCase();

  // ?? Step 3: Process voters
  const processed = await Promise.all(
    voters.map(async (voter) => {
      // Apply fast, intelligent rule-based scoring
      const baseScores = getBaseScores(voter.age);
      const updatedScores = applyContextBoost(baseScores, context?.issue || "", voter.gender);
      
      // Calculate dynamic confidence by capturing the real maximum score value
      const confidence = Math.max(...Object.values(updatedScores));
      const { finalCategory: category } = getFinalCategoryAndConfidence(updatedScores);

      let allSchemes = await getSchemesFromCategoryAndIssue(category);

      // Add women schemes if applicable
      if (voter.gender === "Female") {
        const womenSchemes = await getSchemesFromCategoryAndIssue("Women");
        const existingIds = new Set(allSchemes.map(s => s._id.toString()));
        for (const ws of womenSchemes) {
          if (!existingIds.has(ws._id.toString())) {
            allSchemes.push(ws);
          }
        }
      }

      // Filter: Issue match + Gender match, then limit top 2
      const schemes = allSchemes.filter(s => {
        // Protect women schemes from males
        if (s.category === "Women" && voter.gender !== "Female") return false;

        // Contextual relevance filter for better scoring recommendations
        const schemeIssue = (s.issue_targeted || "").toLowerCase();
        return rawBoothIssues.includes(schemeIssue) || schemeIssue === "";
      }).slice(0, 2);

      return {
        ...voter,
        category,
        gender: voter.gender,
        confidence,
        scores: updatedScores,
        schemes
      };
    })
  );

  // ?? Step 4: Group by category
  const grouped = {};
  processed.forEach(v => {
    if (!grouped[v.category]) {
      grouped[v.category] = [];
    }
    grouped[v.category].push(v);
  });

  return grouped;
};

module.exports = { processBoothData };
