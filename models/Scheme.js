const mongoose = require("mongoose");

const eligibilitySchema = new mongoose.Schema({
  rawText:         { type: String,  default: "" },
  maxIncomeBracket:{ type: String,  default: null },
  requiresPwd:     { type: Boolean, default: false },
  requiresBpl:     { type: Boolean, default: false },
  requiresScst:    { type: Boolean, default: false },
  targetGender:    { type: String,  default: null },
  validOccupations:{ type: [String], default: [] },
  validAreaTypes:  { type: [String], default: [] },
}, { _id: false });

const schemeSchema = new mongoose.Schema({
  scheme_id:          String,
  scheme_name:        String,
  description:        String,
  target_occupation:  String,
  target_interest:    String,
  area_type:          String,
  benefit_type:       String,
  eligibility:        { type: eligibilitySchema, default: () => ({}) },
  priority_score:     Number,
  start_date:         String,
  end_date:           String
});

module.exports = mongoose.model("Scheme", schemeSchema);