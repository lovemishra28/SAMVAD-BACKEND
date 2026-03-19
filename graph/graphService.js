const Scheme = require("../models/Scheme");

const categoryNormalization = {
  Senior: "Senior",
  "Senior Citizen": "Senior",
  Student: "Student",
  Farmer: "Farmer",
  "Unemployed Youth": "Worker", // Map left-overs if any
  Worker: "Worker",
  Women: "Women",
};

const getSchemesFromCategoryAndIssue = async (category, issue) => {
  const normalizedCategory = categoryNormalization[category] || category;

  try {
    const schemes = await Scheme.find({
      category: normalizedCategory,
      // We will remove the exact issue targeting here to fetch all relevant 
      // schemes for the category, then filter in the service based on context.
    });

    return schemes;
  } catch (error) {
    console.error(error);
    return [];
  }
};

module.exports = { getSchemesFromCategoryAndIssue };
