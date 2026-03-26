const Notification = require("../models/Notification");
const NotificationDelivery = require("../models/NotificationDelivery");
const { processBoothData } = require("../services/boothService");
const { logNotificationBatch, getLoggedCategories, getLoggedCategoryStatus } = require("../utils/logger");

// NEW: Twilio specific imports
const twilio = require('twilio');
const dotenv = require('dotenv');
dotenv.config();

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// NEW: Add your 6 team members' 10-digit mobile numbers here
const DEMO_WHATSAPP_NUMBERS = [
  '7668678890', // Team Member 1
  // ... I'll add others later
];

// Mapping from frontend-friendly category names to internal ML category keys
const CATEGORY_MAP = {
  Farmers: "Farmer",
  Students: "Student",
  "Senior Citizens": "Senior Citizen",
  Workers: "Worker",
  Women: "Women",
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

    // Use the segmentation + personalized recommender pipeline
    const { grouped } = await processBoothData(boothId);
    const targetCategory = getCategoryKey(category);
    const voters = grouped[targetCategory] || [];

    // Generate per-voter delivery logs with personalized scheme recommendations
    const logs = voters.map((voter) => {
      // Use the personalized recommender output (top 1–3 ranked schemes per voter)
      // These have already been filtered by gender, area, occupation, interest, and active dates
      const personalizedSchemes = (voter.schemes && voter.schemes.length > 0)
        ? voter.schemes.slice(0, 3)
        : [];

      // Build scheme summary for this voter
      const schemeNames = personalizedSchemes.map(s => s.name || s.scheme_name);
      const schemeScores = personalizedSchemes.map(s => `${s.name || s.scheme_name}(${s.relevanceScore || 0}%)`);
      const matchReasons = personalizedSchemes.flatMap(s => s.matchReasons || []);

      return {
        voterId: voter._id || voter.id || null,
        voterName: voter.name || "",
        voterMobile: voter.mobileNumber || voter.mobile || "N/A",
        schemeId: personalizedSchemes.map(s => s.scheme_id).join(" + "),
        schemeName: schemeNames.join(", "),
        relevanceScores: schemeScores.join(", "),
        matchReasons: matchReasons.join("; "),
        status: "sent",
        channel: deliveryMethod,
        timestamp: new Date(),
      };
    });

    // ─── Console Notification Log ───
    const sentCount = logs.filter(l => l.status === "sent").length;
    console.log("\n╔═══════════════════════════════════════════════════════════════════╗");
    console.log("║           📢 PERSONALIZED NOTIFICATION DISPATCHED               ║");
    console.log("╠═══════════════════════════════════════════════════════════════════╣");
    console.log(`║  Category   : ${category}`);
    console.log(`║  Booth      : ${boothId}`);
    console.log(`║  Voters     : ${voters.length} targeted`);
    console.log(`║  Channel    : ${deliveryMethod}`);
    console.log(`║  Delivered  : ${sentCount}`);
    console.log("╠═══════════════════════════════════════════════════════════════════╣");
    console.log("║  📋 PERSONALIZED RECOMMENDATIONS (sample):                      ║");
    console.log("╠═══════════════════════════════════════════════════════════════════╣");

    // Show first 5 voters with their personalized schemes
    const sampleLogs = logs.slice(0, 5);
    sampleLogs.forEach((log) => {
      console.log(`║  👤 ${log.voterName} (${log.voterMobile})`);
      console.log(`║     Schemes: ${log.schemeName || "None matched"}`);
      console.log(`║     Scores:  ${log.relevanceScores || "N/A"}`);
      console.log(`║     Reason:  ${log.matchReasons || "N/A"}`);
      console.log("║  ─────────────────────────────────────────────────────────────  ║");
    });
    if (voters.length > 5) {
      console.log(`║  ... +${voters.length - 5} more voters with personalized schemes           ║`);
    }
    console.log("╚═══════════════════════════════════════════════════════════════════╝\n");

    // ─── Notification Log File ───
    logNotificationBatch({ 
      category, 
      boothId, 
      schemeIds, 
      deliveryMethod, 
      logs 
    });

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

    // ─── NEW: Send Real WhatsApp Messages to Team Members ───
    logs.forEach((log) => {
      // Check if the number is in our demo array
      if (DEMO_WHATSAPP_NUMBERS.includes(log.voterMobile)) {
        
        // Build a formatted WhatsApp message
        const messageBody = `*Hello ${log.voterName}!* 🎉\n\nBased on your profile, you are eligible for:\n*${log.schemeName}*\n\nPlease check the SAMVAD app or nearest MP Online Shop for more details.\n\n*नमस्ते ${log.voterName} जी!* 🎉\n\nआपकी प्रोफाइल के आधार पर, आप इस योजना के लिए पात्र हैं:\n*${log.schemeName}*\n\nअधिक जानकारी के लिए SAMVAD ऐप या नजदीकी MP Online Shop पर संपर्क करें।`;

        // Send the message via Twilio Sandbox API
        twilioClient.messages.create({
          body: messageBody,
          from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
          to: `whatsapp:+91${log.voterMobile}` // Format as Indian numbers (+91)
        })
        .then(() => console.log(`[Twilio] ✅ WhatsApp sent successfully to ${log.voterMobile}`))
        .catch(err => console.error(`[Twilio] ❌ Failed to send WhatsApp to ${log.voterMobile}:`, err.message));
      }
    });

    // ─── Write per-voter NotificationDelivery docs for mobile API ───
    const deliveryDocs = logs
      .filter(l => l.voterMobile && l.voterMobile !== "N/A")
      .map(l => ({
        mobileNumber: l.voterMobile,
        voterName: l.voterName,
        schemeNames: l.schemeName ? l.schemeName.split(", ") : [],
        schemeIds: l.schemeId ? l.schemeId.split(" + ") : [],
        category,
        boothId,
        relevanceScores: l.relevanceScores || "",
        matchReasons: l.matchReasons || "",
        sentAt: new Date(),
      }));

    if (deliveryDocs.length > 0) {
      await NotificationDelivery.insertMany(deliveryDocs).catch(err => {
        console.error("[Notification] Failed to write delivery docs:", err.message);
      });
      console.log(`[Notification] ${deliveryDocs.length} delivery records saved for mobile API`);
    }

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

const getLogCategories = (req, res) => {
  try {
    const status = getLoggedCategoryStatus();
    res.json({ success: true, categories: status });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to read notification categories from log", error: error.message });
  }
};

module.exports = { sendNotification, listNotifications, getSummary, getLogCategories };