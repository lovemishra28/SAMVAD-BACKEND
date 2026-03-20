const express = require("express");
const router = express.Router();

const { getVoters } = require("../controllers/voterController");

// GET /api/voters?boothId=<id>
router.get("/", getVoters);

module.exports = router;
