const Application = require("../models/Application");

const createApplication = async (req, res) => {
  try {
    const { schemeId, schemeName, voterId, voterName, category, status } = req.body;

    if (!schemeId || !schemeName || !voterId || !voterName || !category) {
      return res.status(400).json({ success: false, message: "Missing required fields." });
    }

    const app = await Application.create({
      schemeId,
      schemeName,
      voterId,
      voterName,
      category,
      status: status || "pending",
      appliedAt: status === "applied" ? new Date() : null,
    });

    res.status(201).json({ success: true, application: app });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to create application", error: error.message });
  }
};

const getApplications = async (req, res) => {
  try {
    const { schemeId } = req.query;
    if (!schemeId) return res.status(400).json({ success: false, message: "schemeId is required" });

    const apps = await Application.find({ schemeId }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, applications: apps });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to list applications", error: error.message });
  }
};

const getApplicationAnalytics = async (req, res) => {
  try {
    const { schemeId } = req.query;
    if (!schemeId) return res.status(400).json({ success: false, message: "schemeId is required" });

    const apps = await Application.find({ schemeId }).lean();
    const total = apps.length;
    const applied = apps.filter(a => a.status === "applied").length;
    const approved = apps.filter(a => a.status === "approved").length;
    const rejected = apps.filter(a => a.status === "rejected").length;
    const pending = apps.filter(a => a.status === "pending").length;

    const categoryBreakdown = apps.reduce((acc, app) => {
      const cat = app.category || "Others";
      if (!acc[cat]) acc[cat] = 0;
      acc[cat] += 1;
      return acc;
    }, {});

    res.json({
      success: true,
      analytics: {
        total,
        applied,
        approved,
        rejected,
        pending,
        approvalRate: total ? Number(((approved / total) * 100).toFixed(1)) : 0,
        categoryBreakdown,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch application analytics", error: error.message });
  }
};

module.exports = { createApplication, getApplications, getApplicationAnalytics };
