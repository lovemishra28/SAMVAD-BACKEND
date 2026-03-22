const Notification = require("../models/Notification");
const Voter = require("../models/Voter");
const Booth = require("../models/Booth");
const { processBoothData } = require("../services/boothService");
const { sendSms } = require("../services/twilioService");

// Mapping from frontend-friendly category names to internal ML category keys
const CATEGORY_MAP = {
  Farmers: "Farmer",
  Students: "Student",
  "Senior Citizens": "Senior",
  Workers: "Worker",
  Others: "Others",
};

const getCategoryKey = (category) => CATEGORY_MAP[category] || category;

const MAX_SMS_BODY_LENGTH = 1200;

const clampSmsBody = (text) => {
  const value = String(text || "").trim();
  if (value.length <= MAX_SMS_BODY_LENGTH) return value;
  return `${value.slice(0, MAX_SMS_BODY_LENGTH - 3)}...`;
};

const buildMessage = ({ category, schemeIds, customMessage }) => {
  if (customMessage && String(customMessage).trim()) {
    return clampSmsBody(customMessage);
  }

  const safeSchemes = Array.isArray(schemeIds) ? schemeIds : [];
  const preview = safeSchemes.slice(0, 3).join(", ");
  const extraCount = Math.max(0, safeSchemes.length - 3);
  const extra = extraCount ? ` and ${extraCount} more` : "";
  const message = `SAMVAD: New scheme update for ${category || "citizens"}. Relevant schemes: ${preview}${extra}.`;
  return clampSmsBody(message);
};

const shouldSendToAll = ({ targetScope, sendTo, category, boothId }) => {
  if (String(targetScope || "").toLowerCase() === "all") return true;
  if (String(sendTo || "").toLowerCase() === "all") return true;
  if (String(category || "").toLowerCase() === "all") return true;
  if (!boothId || !category) return true;
  return false;
};

const resolveBoothId = (query) => {
  return String(query.boothId || query.booth_id || query.booth || "").trim();
};

/**
 * POST /api/notifications
 * Body: { category, boothId, schemeIds, deliveryMethod, targetScope, customMessage }
 */
const sendNotification = async (req, res) => {
  try {
    const {
      category,
      boothId,
      schemeIds,
      deliveryMethod = "sms",
      targetScope,
      sendTo,
      customMessage,
      message,
    } = req.body;

    if (!Array.isArray(schemeIds) || schemeIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: schemeIds (array)",
      });
    }

    const allMode = shouldSendToAll({ targetScope, sendTo, category, boothId });
    const normalizedBoothId = String(boothId || "").trim();

    // Prevent repeat notification dispatch for the same booth.
    if (!allMode && normalizedBoothId) {
      const alreadySent = await Notification.findOne({ boothId: normalizedBoothId }).sort({ sentAt: -1 }).lean();
      if (alreadySent) {
        return res.status(409).json({
          success: false,
          message: `Notifications already sent for ${normalizedBoothId}. Re-send is blocked for this booth.`,
          boothId: normalizedBoothId,
          alreadySentAt: alreadySent.sentAt,
        });
      }
    }

    let voters = [];
    if (allMode) {
      voters = await Voter.find({}).lean();
    } else {
      // Use the segmentation pipeline to determine the target voter list
      const { grouped } = await processBoothData(normalizedBoothId);
      const targetCategory = getCategoryKey(category);
      voters = grouped[targetCategory] || [];
    }

    const messageBody = buildMessage({
      category: allMode ? "all voters" : category,
      schemeIds,
      customMessage: customMessage || message,
    });

    const logs = [];
    for (const voter of voters) {
      const entry = {
        voterId: voter._id || voter.id || null,
        voterName: voter.name || "",
        schemeId: schemeIds[0],
        schemeName: schemeIds[0],
        status: "not_sent",
        channel: deliveryMethod,
        timestamp: new Date(),
      };

      try {
        if (deliveryMethod === "sms") {
          await sendSms({ to: voter.mobileNumber, body: messageBody });
          entry.status = "delivered";
        } else {
          entry.status = "not_sent";
          entry.errorMessage = `Delivery method '${deliveryMethod}' is not integrated yet`;
        }
      } catch (err) {
        entry.status = "not_sent";
        entry.errorMessage = err.message;
      }

      logs.push(entry);
    }

    const deliveredCount = logs.filter((l) => l.status === "delivered").length;
    const notSentCount = logs.filter((l) => l.status === "not_sent" || l.status === "failed").length;

    // ─── Console Notification Log (placeholder for future SMS/WhatsApp) ───
    console.log("\n╔══════════════════════════════════════════════════════════╗");
    console.log("║           📢 NOTIFICATION DISPATCHED                    ║");
    console.log("╠══════════════════════════════════════════════════════════╣");
    console.log(`║  Category   : ${allMode ? "All" : category}`);
    console.log(`║  Booth      : ${allMode ? "All Booths" : normalizedBoothId}`);
    console.log(`║  Schemes    : ${schemeIds.join(", ")}`);
    console.log(`║  Voters     : ${voters.length} targeted`);
    console.log(`║  Channel    : ${deliveryMethod}`);
    console.log(`║  Delivered  : ${deliveredCount}`);
    console.log(`║  Not Sent   : ${notSentCount}`);
    console.log("╠══════════════════════════════════════════════════════════╣");
    // Print first 5 voter names as sample
    const sampleVoters = voters.slice(0, 5).map(v => v.name || "Unknown");
    console.log(`║  Sample     : ${sampleVoters.join(", ")}${voters.length > 5 ? ` ... +${voters.length - 5} more` : ""}`);
    console.log("╚══════════════════════════════════════════════════════════╝\n");

    const record = await Notification.create({
      category: allMode ? "All" : category,
      boothId: allMode ? "ALL" : normalizedBoothId,
      messageBody,
      schemes: schemeIds,
      voterCount: voters.length,
      deliveredCount,
      notSentCount,
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
      bucket.failed += (n.logs || []).filter((l) => l.status === "failed" || l.status === "not_sent").length;
      bucket.lastSentAt = bucket.lastSentAt || n.sentAt;
      if (n.sentAt > bucket.lastSentAt) bucket.lastSentAt = n.sentAt;
    });

    res.json({ success: true, summary });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to build notification summary", error: error.message });
  }
};

const getLogCategories = async (req, res) => {
  try {
    const boothId = resolveBoothId(req.query);

    // Keep category delivery status booth-specific to avoid false delivered state
    // when the user switches to a different booth in the UI.
    if (!boothId) {
      return res.json({ success: true, categories: [] });
    }

    const notifications = await Notification.find({ boothId }).sort({ sentAt: -1 }).lean();
    const categoryState = {};

    for (const item of notifications) {
      const category = String(item.category || "").trim();
      if (!category) continue;
      if (!categoryState[category]) {
        categoryState[category] = {
          category,
          boothId,
          lastSentAt: item.sentAt,
        };
      }
    }

    const status = Object.values(categoryState);
    res.json({ success: true, categories: status });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to read notification categories", error: error.message });
  }
};

const getBoothStatus = async (req, res) => {
  try {
    const requestedBoothId = resolveBoothId(req.query);

    if (requestedBoothId) {
      const latest = await Notification.findOne({ boothId: requestedBoothId }).sort({ sentAt: -1 }).lean();
      return res.json({
        success: true,
        booth: {
          boothId: requestedBoothId,
          ticked: Boolean(latest),
          lastSentAt: latest?.sentAt || null,
          lastCategory: latest?.category || null,
          deliveredCount: latest?.deliveredCount ?? (latest?.logs || []).filter((l) => l.status === "delivered").length,
          notSentCount: latest?.notSentCount ?? (latest?.logs || []).filter((l) => l.status === "not_sent" || l.status === "failed").length,
          messageBody: latest?.messageBody || "",
        },
      });
    }

    const booths = await Booth.find({}).select("id name").sort({ id: 1 }).lean();
    const notifications = await Notification.find({ boothId: { $nin: ["", null, "ALL"] } }).sort({ sentAt: -1 }).lean();

    const latestByBooth = {};
    for (const item of notifications) {
      if (!item.boothId || latestByBooth[item.boothId]) continue;
      latestByBooth[item.boothId] = item;
    }

    const boothStatus = booths.map((booth) => {
      const latest = latestByBooth[booth.id];
      return {
        boothId: booth.id,
        boothName: booth.name || booth.id,
        ticked: Boolean(latest),
        lastSentAt: latest?.sentAt || null,
        lastCategory: latest?.category || null,
        deliveredCount: latest?.deliveredCount ?? (latest?.logs || []).filter((l) => l.status === "delivered").length,
        notSentCount: latest?.notSentCount ?? (latest?.logs || []).filter((l) => l.status === "not_sent" || l.status === "failed").length,
      };
    });

    return res.json({ success: true, booths: boothStatus });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to build booth notification status", error: error.message });
  }
};

module.exports = { sendNotification, listNotifications, getSummary, getLogCategories, getBoothStatus };