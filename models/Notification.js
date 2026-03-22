const mongoose = require("mongoose");

const notificationLogSchema = new mongoose.Schema({
  voterId: String,
  voterName: String,
  schemeId: String,
  schemeName: String,
  errorMessage: String,
  status: {
    type: String,
    enum: ["delivered", "failed", "not_sent"],
    default: "delivered",
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
  messageBody: {
    type: String,
    default: "",
  },
  schemes: [String],
  voterCount: Number,
  deliveredCount: {
    type: Number,
    default: 0,
  },
  notSentCount: {
    type: Number,
    default: 0,
  },
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
