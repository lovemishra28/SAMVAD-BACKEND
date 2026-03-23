const mongoose = require("mongoose");

const schemeSchema = new mongoose.Schema({
  scheme_id: String,
  scheme_name: String,
  description: String,
  target_occupation: String,
  target_interest: String,
  area_type: String,
  benefit_type: String,
  eligibility: String,
  priority_score: Number,
  start_date: String,
  end_date: String
});

module.exports = mongoose.model("Scheme", schemeSchema);