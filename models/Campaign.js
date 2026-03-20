const mongoose = require("mongoose");

const deliveryLogSchema = new mongoose.Schema({
  voterId: String,
  voterName: String,
  status: {
    type: String,
    enum: ["delivered", "failed"],
    required: true,
  },
  channel: {
    type: String,
    enum: ["sms", "voice", "email", "push"],
    default: "sms",
  },
  timestamp: {
    type: Date,
    default: () => new Date(),
  },
});

const campaignSchema = new mongoose.Schema({
  schemeId: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ["launch", "reminder"],
    required: true,
  },
  category: String,
  boothId: String,
  totalTargeted: {
    type: Number,
    default: 0,
  },
  delivered: {
    type: Number,
    default: 0,
  },
  failed: {
    type: Number,
    default: 0,
  },
  deliveryLogs: {
    type: [deliveryLogSchema],
    default: [],
  },
  status: {
    type: String,
    enum: ["pending", "in_progress", "completed", "failed"],
    default: "pending",
  },
  createdAt: {
    type: Date,
    default: () => new Date(),
  },
  updatedAt: {
    type: Date,
    default: () => new Date(),
  },
}, { timestamps: true });

campaignSchema.pre("save", function () {
  this.updatedAt = new Date();
});

module.exports = mongoose.model("Campaign", campaignSchema);
