const Notification = require("../models/Notification");
const { processBoothData } = require("../services/boothService");

// Mapping from frontend-friendly category names to internal ML category keys
const CATEGORY_MAP = {
  Farmers: "Farmer",
  Students: "Student",
  "Senior Citizens": "Senior",
  Workers: "Worker",
  Others: "Others",
};

const getCategoryKey = (category) => CATEGORY_MAP[category] || category;

/**
 * POST /api/notifications
 * Body: { category, boothId, schemeIds, deliveryMethod }
 */
const sendNotification = async (req, res) => {
  try {
    const { category, boothId, schemeIds, deliveryMethod = "sms" } = req.body;

    if (!category || !boothId || !Array.isArray(schemeIds) || schemeIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: category, boothId, schemeIds (array)",
      });
    }

    // Use the segmentation pipeline to determine the target voter list
    const { grouped } = await processBoothData(boothId);
    const targetCategory = getCategoryKey(category);
    const voters = grouped[targetCategory] || [];

    // Generate delivery logs (simulated)
    const logs = voters.map((voter) => {
      const status = Math.random() < 0.92 ? "delivered" : "failed";
      return {
        voterId: voter._id || voter.id || null,
        voterName: voter.name || "",
        schemeId: schemeIds[Math.floor(Math.random() * schemeIds.length)],
        schemeName: schemeIds[Math.floor(Math.random() * schemeIds.length)],
        status,
        channel: deliveryMethod,
        timestamp: new Date(),
      };
    });

    // ─── Console Notification Log (placeholder for future SMS/WhatsApp) ───
    console.log("\n╔══════════════════════════════════════════════════════════╗");
    console.log("║           📢 NOTIFICATION DISPATCHED                    ║");
    console.log("╠══════════════════════════════════════════════════════════╣");
    console.log(`║  Category   : ${category}`);
    console.log(`║  Booth      : ${boothId}`);
    console.log(`║  Schemes    : ${schemeIds.join(", ")}`);
    console.log(`║  Voters     : ${voters.length} targeted`);
    console.log(`║  Channel    : ${deliveryMethod}`);
    console.log(`║  Delivered  : ${logs.filter(l => l.status === "delivered").length}`);
    console.log(`║  Failed     : ${logs.filter(l => l.status === "failed").length}`);
    console.log("╠══════════════════════════════════════════════════════════╣");
    // Print first 5 voter names as sample
    const sampleVoters = voters.slice(0, 5).map(v => v.name || "Unknown");
    console.log(`║  Sample     : ${sampleVoters.join(", ")}${voters.length > 5 ? ` ... +${voters.length - 5} more` : ""}`);
    console.log("╚══════════════════════════════════════════════════════════╝\n");

    const record = await Notification.create({
      category,
      boothId,
      schemes: schemeIds,
      voterCount: voters.length,
      sentAt: new Date(),
      status: "sent",
      deliveryMethod,
      logs,
    });

    res.status(201).json({ success: true, notification: record, votersNotified: voters.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to send notification", error: error.message });
  }
};

const listNotifications = async (req, res) => {
  try {
    const { category, boothId } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (boothId) filter.boothId = boothId;

    const notifications = await Notification.find(filter).sort({ sentAt: -1 }).lean();
    res.json({ success: true, notifications });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to list notifications", error: error.message });
  }
};

const getSummary = async (req, res) => {
  try {
    const notifications = await Notification.find({}).lean();
    const summary = {};

    notifications.forEach((n) => {
      const key = n.category || "Unknown";
      if (!summary[key]) {
        summary[key] = {
          totalNotifications: 0,
          totalVoters: 0,
          delivered: 0,
          failed: 0,
          lastSentAt: null,
        };
      }
      const bucket = summary[key];
      bucket.totalNotifications += 1;
      bucket.totalVoters += n.voterCount || 0;
      bucket.delivered += (n.logs || []).filter((l) => l.status === "delivered").length;
      bucket.failed += (n.logs || []).filter((l) => l.status === "failed").length;
      bucket.lastSentAt = bucket.lastSentAt || n.sentAt;
      if (n.sentAt > bucket.lastSentAt) bucket.lastSentAt = n.sentAt;
    });

    res.json({ success: true, summary });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to build notification summary", error: error.message });
  }
};

module.exports = { sendNotification, listNotifications, getSummary };