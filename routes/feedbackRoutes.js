const express = require("express");
const router = express.Router();
const { listFeedback, getSchemeFeedbackSummary } = require("../controllers/feedbackController");

// Public routes (web admin)
router.get("/", listFeedback);
router.get("/scheme-summary", getSchemeFeedbackSummary);

module.exports = router;
