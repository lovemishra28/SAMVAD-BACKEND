const express = require("express");
const router = express.Router();

const { createApplication, getApplications, getApplicationAnalytics } = require("../controllers/applicationController");

// POST /api/applications
router.post("/", createApplication);

// GET /api/applications?schemeId=<id>
router.get("/", getApplications);

// GET /api/applications/analytics?schemeId=<id>
router.get("/analytics", getApplicationAnalytics);

module.exports = router;
