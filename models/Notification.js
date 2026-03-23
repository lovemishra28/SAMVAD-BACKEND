const mongoose = require("mongoose");

const notificationLogSchema = new mongoose.Schema({
  voterId: String,
  voterName: String,
  voterMobile: String,
  schemeId: String,
  schemeName: String,
  relevanceScores: String,
  matchReasons: String,
  status: {
    type: String,
    enum: ["sent", "delivered", "failed"],
    default: "sent",
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

const notificationSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
  },
  boothId: String,
  schemes: [String],
  voterCount: Number,
  sentAt: {
    type: Date,
    default: () => new Date(),
  },
  status: {
    type: String,
    enum: ["sent", "failed"],
    default: "sent",
  },
  deliveryMethod: {
    type: String,
    enum: ["sms", "voice", "email", "push"],
    default: "sms",
  },
  logs: {
    type: [notificationLogSchema],
    default: [],
  },
}, { timestamps: true });

module.exports = mongoose.model("Notification", notificationSchema);
