const Campaign = require("../models/Campaign");
const { processBoothData } = require("../services/boothService");

// Map frontend categories to ML category keys
const CATEGORY_MAP = {
  Farmers: "Farmer",
  Students: "Student",
  "Senior Citizens": "Senior",
  Workers: "Worker",
  Others: "Others",
};

const getCategoryKey = (category) => CATEGORY_MAP[category] || category;

const simulateDeliveryLogs = (voters, schemeId) => {
  return voters.map((voter) => {
    const status = Math.random() < 0.9 ? "delivered" : "failed";
    const channel = Math.random() < 0.7 ? "sms" : "voice";
    return {
      voterId: voter._id || voter.id || null,
      voterName: voter.name || "",
      status,
      channel,
      timestamp: new Date(),
    };
  });
};

/**
 * POST /api/campaigns
 * Body: { schemeId, type, category, boothId }
 */
const createCampaign = async (req, res) => {
  try {
    const { schemeId, type, category, boothId } = req.body;

    if (!schemeId || !type) {
      return res.status(400).json({ success: false, message: "Missing required fields: schemeId, type" });
    }

    // Determine target voters (via booth analysis if boothId supplied)
    let voters = [];
    if (boothId) {
      const { grouped } = await processBoothData(boothId);
      const targetCat = getCategoryKey(category);
      voters = grouped[targetCat] || [];
    }

    const logs = simulateDeliveryLogs(voters, schemeId);
    const delivered = logs.filter((l) => l.status === "delivered").length;
    const failed = logs.filter((l) => l.status === "failed").length;

    const campaign = await Campaign.create({
      schemeId,
      type,
      category,
      boothId: boothId || null,
      totalTargeted: voters.length,
      delivered,
      failed,
      deliveryLogs: logs,
      status: "completed",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // ─── Console Campaign Log ───
    console.log(`\n📣 CAMPAIGN CREATED — ${type.toUpperCase()} for scheme ${schemeId}`);
    console.log(`   Category: ${category || "N/A"} | Booth: ${boothId || "N/A"}`);
    console.log(`   Targeted: ${voters.length} | Delivered: ${delivered} | Failed: ${failed}`);

    res.status(201).json({ success: true, campaign });
  } catch (error) {
    console.error(error);
    console.error(error.stack);
    res.status(500).json({ success: false, message: "Failed to create campaign", error: error.message });
  }
};

/**
 * GET /api/campaigns?schemeId=
 */
const listCampaigns = async (req, res) => {
  try {
    const { schemeId } = req.query;
    const filter = {};
    if (schemeId) filter.schemeId = schemeId;

    const campaigns = await Campaign.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, campaigns });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to list campaigns", error: error.message });
  }
};

/**
 * GET /api/campaigns/:id/analytics
 */
const getCampaignAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findById(id).lean();
    if (!campaign) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }

    const total = campaign.deliveryLogs.length;
    const delivered = campaign.deliveryLogs.filter((l) => l.status === "delivered").length;
    const failed = campaign.deliveryLogs.filter((l) => l.status === "failed").length;

    res.json({
      success: true,
      analytics: {
        total,
        delivered,
        failed,
        deliveredPct: total ? Number(((delivered / total) * 100).toFixed(1)) : 0,
        failedPct: total ? Number(((failed / total) * 100).toFixed(1)) : 0,
        timeline: campaign.deliveryLogs.slice(-10),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch analytics", error: error.message });
  }
};

module.exports = { createCampaign, listCampaigns, getCampaignAnalytics };
