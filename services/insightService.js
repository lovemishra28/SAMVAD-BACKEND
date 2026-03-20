/**
 * Normalize ML category names into frontend segment keys.
 */
const CATEGORY_KEY_MAP = {
  Farmer: "farmers",
  Student: "students",
  Senior: "seniorCitizens",
  Worker: "workers",
  Others: "others",
};

/**
 * Convert grouped voters by ML category into the frontend segment structure.
 * Ensures all expected keys exist.
 */
const buildSegments = (groupedByCategory = {}) => {
  const segments = {
    farmers: [],
    students: [],
    seniorCitizens: [],
    workers: [],
    others: [],
  };

  for (const [category, voters] of Object.entries(groupedByCategory)) {
    const key = CATEGORY_KEY_MAP[category] || "others";
    segments[key] = voters || [];
  }

  return segments;
};

/**
 * Flatten grouped voter arrays into a single voter list.
 */
const flattenVoters = (groupedByCategory = {}) => {
  return Object.values(groupedByCategory).flat();
};

/**
 * Compute age statistics for a voter list.
 */
const computeAgeStats = (voters = []) => {
  if (!voters.length) return { avgAge: 0, minAge: 0, maxAge: 0 };

  const ages = voters.map((v) => Number(v.age) || 0).filter((a) => !Number.isNaN(a));
  const avgAge = ages.reduce((sum, a) => sum + a, 0) / ages.length;
  return {
    avgAge: Number(avgAge.toFixed(1)),
    minAge: Math.min(...ages),
    maxAge: Math.max(...ages),
  };
};

/**
 * Compute gender distribution counts and percentages.
 */
const computeGenderSplit = (voters = []) => {
  const counts = { Male: 0, Female: 0, Other: 0 };
  voters.forEach((v) => {
    const gender = (v.gender || "Other").toString();
    if (counts[gender] !== undefined) counts[gender] += 1;
    else counts.Other += 1;
  });

  const total = voters.length || 1;
  return {
    counts,
    percents: {
      Male: Number(((counts.Male / total) * 100).toFixed(1)),
      Female: Number(((counts.Female / total) * 100).toFixed(1)),
      Other: Number(((counts.Other / total) * 100).toFixed(1)),
    },
  };
};

/**
 * Compute category distribution (counts + percentages) given frontend segments.
 */
const computeCategoryDistribution = (segments) => {
  const categoryCounts = {
    Farmers: segments.farmers.length,
    Students: segments.students.length,
    "Senior Citizens": segments.seniorCitizens.length,
    Workers: segments.workers.length,
    Others: segments.others.length,
  };

  const total = Object.values(categoryCounts).reduce((sum, c) => sum + c, 0) || 1;

  const categoryDistribution = {};
  for (const [name, count] of Object.entries(categoryCounts)) {
    categoryDistribution[name] = {
      count,
      percent: Number(((count / total) * 100).toFixed(1)),
    };
  }

  const dominantCategory = Object.entries(categoryCounts).reduce(
    (best, [name, count]) => (count > best.count ? { name, count } : best),
    { name: "", count: 0 }
  );

  return {
    categoryDistribution,
    dominantCategory: dominantCategory.name || "",
  };
};

/**
 * Generate a small insight summary string for a booth.
 */
const generateInsightText = ({
  totalVoters,
  avgAge,
  dominantCategory,
  categoryDistribution,
  genderSplit,
  boothIssue,
}) => {
  const genderSummary = `Gender split: ${genderSplit.percents.Female}% female, ${genderSplit.percents.Male}% male, ${genderSplit.percents.Other}% other.`;
  const issuePhrase = boothIssue ? ` Since the booth issue is about "${boothIssue}",` : "";

  const topCategorySummary = dominantCategory
    ? `the largest voter segment is ${dominantCategory}.`
    : "voter segments are evenly distributed.";

  return `Booth has ${totalVoters} registered voters with an average age of ${avgAge}. ${topCategorySummary} ${issuePhrase} ${genderSummary}`;
};

/**
 * Build a dashboard summary object from grouped voter segments.
 */
const buildSummary = ({ groupedByCategory, boothIssue }) => {
  const segments = buildSegments(groupedByCategory);
  const voters = flattenVoters(groupedByCategory);
  const totalVoters = voters.length;
  const ageStats = computeAgeStats(voters);
  const genderSplit = computeGenderSplit(voters);
  const { categoryDistribution, dominantCategory } = computeCategoryDistribution(segments);

  return {
    totalVoters,
    avgAge: ageStats.avgAge,
    minAge: ageStats.minAge,
    maxAge: ageStats.maxAge,
    dominantCategory,
    categoryDistribution,
    genderSplit,
    insightText: generateInsightText({
      totalVoters,
      avgAge: ageStats.avgAge,
      dominantCategory,
      categoryDistribution,
      genderSplit,
      boothIssue,
    }),
  };
};

module.exports = {
  buildSegments,
  flattenVoters,
  computeAgeStats,
  computeGenderSplit,
  computeCategoryDistribution,
  generateInsightText,
  buildSummary,
};
