const express = require("express");
const router = express.Router();

const { sendNotification, listNotifications, getSummary, getLogCategories, getBoothStatus } = require("../controllers/notificationController");

// POST /api/notifications
router.post("/", sendNotification);

// GET /api/notifications
router.get("/", listNotifications);

// GET /api/notifications/summary
router.get("/summary", getSummary);

// GET /api/notifications/log-categories
router.get("/log-categories", getLogCategories);

// GET /api/notifications/booth-status?boothId=Booth_18
router.get("/booth-status", getBoothStatus);

module.exports = router;
