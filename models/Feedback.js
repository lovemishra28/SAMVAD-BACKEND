const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["scheme_feedback", "suggestion"],
    required: true,
  },
  mobileNumber: {
    type: String,
    required: true,
  },
  voterName: {
    type: String,
    default: "",
  },
  // Scheme feedback fields
  schemeId: {
    type: String,
    default: null,
  },
  schemeName: {
    type: String,
    default: null,
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: null,
  },
  note: {
    type: String,
    default: "",
  },
  // Suggestion fields
  suggestionText: {
    type: String,
    default: "",
  },
}, { timestamps: true });

// Index for quick lookups
feedbackSchema.index({ mobileNumber: 1 });
feedbackSchema.index({ schemeId: 1, type: 1 });

module.exports = mongoose.model("Feedback", feedbackSchema);
