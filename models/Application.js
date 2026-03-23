const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema({
  schemeId: {
    type: String,
    required: true,
  },
  schemeName: {
    type: String,
    required: true,
  },
  voterId: {
    type: String,
    required: true,
  },
  voterName: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ["applied", "approved", "rejected", "pending"],
    default: "pending",
  },
  appliedAt: {
    type: Date,
    default: null,
  },
  lastUpdated: {
    type: Date,
    default: () => new Date(),
  },
  portalReference: String,
  applicantAddress: {
    type: String,
    default: "",
  },
}, { timestamps: true });

applicationSchema.pre("save", function () {
  this.lastUpdated = new Date();
});

applicationSchema.index({ schemeId: 1, voterId: 1 }, { unique: true });

module.exports = mongoose.model("Application", applicationSchema);
