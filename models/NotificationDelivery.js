const mongoose = require("mongoose");

/**
 * Flat per-voter notification delivery record.
 * One doc per voter per notification dispatch.
 * Mobile API queries this by mobileNumber for fast lookup.
 */
const notificationDeliverySchema = new mongoose.Schema({
  mobileNumber: {
    type: String,
    required: true,
    index: true,
  },
  voterName: { type: String, default: "" },

  // Scheme data — names + IDs for mobile app to display
  schemeNames: { type: [String], default: [] },
  schemeIds:   { type: [String], default: [] },

  // Context
  category: { type: String, default: "" },
  boothId:  { type: String, default: "" },

  // Scores and reasons for transparency
  relevanceScores: { type: String, default: "" },
  matchReasons:    { type: String, default: "" },

  sentAt: {
    type: Date,
    default: () => new Date(),
  },
  isUnread: {
    type: Boolean,
    default: true,
  },
  viewedAt: {
    type: Date,
    default: null,
  },
  readAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

notificationDeliverySchema.index({ mobileNumber: 1, isUnread: 1, sentAt: -1 });

module.exports = mongoose.model("NotificationDelivery", notificationDeliverySchema);
