const mongoose = require("mongoose");

const notificationLogSchema = new mongoose.Schema({
  voterId: String,
  voterName: String,
  schemeId: String,
  schemeName: String,
  status: {
    type: String,
    enum: ["delivered", "failed"],
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
