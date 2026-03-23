const getBaseScores = (age, area_type) => {
  let scores = { Student: 0, Worker: 0, Farmer: 0, "Senior Citizen": 0 };

  if (age < 22) {
    scores.Student = 0.8;
    scores.Worker = 0.2;
  } else if (age >= 22 && age <= 30) {
    scores.Student = 0.3;
    scores.Worker = 0.6;
    scores.Farmer = 0.1;
  } else if (age > 30 && age <= 60) {
    scores.Worker = 0.6;
    scores.Farmer = 0.4;
  } else {
    scores["Senior Citizen"] = 0.9;
    scores.Worker = 0.1;
  }

  if (area_type === "Rural") {
    scores.Farmer += 0.3;
  } else if (area_type === "Urban") {
    scores.Worker += 0.2;
    scores.Student += 0.1;
    scores.Farmer -= 0.3;
  }

  for (let key in scores) {
    scores[key] = Math.max(0, scores[key]);
  }
  return scores;
};

const applyContextBoost = (scores, issues = "", gender = "Other") => {
  const lowerIssue = (issues || "").toLowerCase();

  if (lowerIssue.includes("agriculture") || lowerIssue.includes("irrigation") || lowerIssue.includes("farmer")) {
    scores.Farmer += 0.4;
  }
  if (lowerIssue.includes("job") || lowerIssue.includes("skill")) {
    scores.Student += 0.3;
    scores.Worker += 0.4;
  }
  if (lowerIssue.includes("health") || lowerIssue.includes("pension") || lowerIssue.includes("senior")) {
    scores["Senior Citizen"] += 0.5;
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

const predictCategory = (age, area_type, issues, gender) => {
  let scores = getBaseScores(age, area_type);
  scores = applyContextBoost(scores, issues, gender);
  return getFinalCategoryAndConfidence(scores).finalCategory;
};

module.exports = { getBaseScores, applyContextBoost, getFinalCategoryAndConfidence, predictCategory };
