const express = require("express");
const router = express.Router();

const { getDashboard } = require("../controllers/dashboardController");

// GET /api/dashboard/:boothId
router.get("/:boothId", getDashboard);

module.exports = router;
