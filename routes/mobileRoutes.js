const express = require("express");
const router = express.Router();
const { auth } = require("../middleware/auth");
const {
  getNotifications,
  getSchemes,
  applyForScheme,
  getSchemeAppliedStatus,
  getApplications,
  getMyRecommendations,
  markAllNotificationsRead,
} = require("../controllers/mobileController");

// All mobile routes require JWT authentication
router.use(auth);

router.get("/notifications", getNotifications);
router.patch("/notifications/mark-all-read", markAllNotificationsRead);
router.get("/schemes", getSchemes);
router.get("/schemes/:schemeId/applied-status", getSchemeAppliedStatus);
router.post("/apply", applyForScheme);
router.get("/applications", getApplications);
router.get("/my-recommendations", getMyRecommendations);

module.exports = router;
