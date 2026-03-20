const express = require("express");
const router = express.Router();

const { createCampaign, listCampaigns, getCampaignAnalytics } = require("../controllers/campaignController");

// POST /api/campaigns
router.post("/", createCampaign);

// GET /api/campaigns?schemeId=
router.get("/", listCampaigns);

// GET /api/campaigns/:id/analytics
router.get("/:id/analytics", getCampaignAnalytics);

module.exports = router;
