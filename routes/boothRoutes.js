const express = require("express");
const router = express.Router();

const { getBooths, getBooth, analyzeBooth, processBooth } = require("../controllers/boothController");

// Public booth endpoints
router.get("/list", getBooths);
router.get("/:boothId", getBooth);
router.get("/:boothId/analyze", analyzeBooth);

// Existing processing endpoint
router.post("/process", processBooth);

module.exports = router;