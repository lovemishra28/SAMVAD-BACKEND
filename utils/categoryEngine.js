const getBaseScores = (age) => {
  let scores = { Student: 0, Worker: 0, Farmer: 0, Senior: 0 };

  if (age < 22) {
    scores.Student = 0.7;
    scores.Worker = 0.3;
  }
  else if (age >= 22 && age <= 30) {
    scores.Student = 0.4;
    scores.Worker = 0.5;
    scores.Farmer = 0.2;
  }
  else if (age > 30 && age <= 60) {
    scores.Worker = 0.6;
    scores.Farmer = 0.4;
  }
  else {
    scores.Senior = 1.0;
    scores.Farmer = 0.3;
  }
  return scores;
};

const applyContextBoost = (scores, issues = "", gender = "Other") => {
  const lowerIssue = (issues || "").toLowerCase();

  if (lowerIssue.includes("agriculture") || lowerIssue.includes("irrigation") || lowerIssue.includes("farmer")) {
    scores.Farmer += 0.3;
  }
  if (lowerIssue.includes("job") || lowerIssue.includes("skill")) {
    scores.Student += 0.3;
    scores.Worker += 0.3;
  }
  if (lowerIssue.includes("health") || lowerIssue.includes("pension") || lowerIssue.includes("senior")) {
    scores.Senior += 0.3;
  }
  if (gender === "Female" && (lowerIssue.includes("women") || lowerIssue.includes("maternal"))) {
    scores.Worker += 0.3;
    scores.Student += 0.2;
  }
  for (let key in scores) {
    scores[key] = Math.min(scores[key] || 0, 1.0);
  }
  return scores;
};

const getFinalCategoryAndConfidence = (scores) => {
  let max = -1;
  let finalCategory = "Worker";

  for (let key in scores) {
    if (scores[key] > max) {
      max = scores[key];
      finalCategory = key;
    }
  }
  return { finalCategory, confidence: Number(max.toFixed(2)) };
};

module.exports = { getBaseScores, applyContextBoost, getFinalCategoryAndConfidence };
