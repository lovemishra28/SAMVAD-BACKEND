const Feedback = require("../models/Feedback");

/**
 * GET /api/feedback
 * Public (web admin). List all feedback, optionally filtered by schemeId or type.
 */
const listFeedback = async (req, res) => {
  try {
    const query = {};
    if (req.query.schemeId) query.schemeId = req.query.schemeId;
    if (req.query.type) query.type = req.query.type;

    const feedback = await Feedback.find(query)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json({ success: true, feedback });
  } catch (error) {
    console.error("[Feedback] listFeedback error:", error);
    res.status(500).json({ success: false, message: "Failed to list feedback" });
  }
};

/**
 * GET /api/feedback/scheme-summary
 * Public (web admin). Per-scheme average rating, count, and recent notes.
 */
const getSchemeFeedbackSummary = async (req, res) => {
  try {
    const pipeline = [
      { $match: { type: "scheme_feedback", rating: { $ne: null } } },
      {
        $group: {
          _id: "$schemeId",
          schemeName: { $first: "$schemeName" },
          avgRating: { $avg: "$rating" },
          totalRatings: { $sum: 1 },
          recentNotes: {
            $push: {
              note: "$note",
              rating: "$rating",
              voterName: "$voterName",
              createdAt: "$createdAt",
            },
          },
        },
      },
      { $sort: { totalRatings: -1 } },
    ];

    const results = await Feedback.aggregate(pipeline);

    // Trim recentNotes to latest 10 per scheme
    const summaries = results.map(r => ({
      schemeId: r._id,
      schemeName: r.schemeName,
      avgRating: Math.round(r.avgRating * 10) / 10,
      totalRatings: r.totalRatings,
      recentNotes: r.recentNotes
        .filter(n => n.note && n.note.trim())
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10),
    }));

    // Also get suggestion count
    const suggestionCount = await Feedback.countDocuments({ type: "suggestion" });

    res.json({ success: true, summaries, suggestionCount });
  } catch (error) {
    console.error("[Feedback] getSchemeFeedbackSummary error:", error);
    res.status(500).json({ success: false, message: "Failed to get summary" });
  }
};

/**
 * POST /api/mobile/feedback (auth required)
 * Submit scheme feedback or suggestion.
 */
const submitFeedback = async (req, res) => {
  try {
    const { type, schemeId, schemeName, rating, note, suggestionText } = req.body;
    const user = req.user;

    if (!type || !["scheme_feedback", "suggestion"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "type must be 'scheme_feedback' or 'suggestion'",
      });
    }

    if (type === "scheme_feedback") {
      if (!schemeId || !schemeName) {
        return res.status(400).json({
          success: false,
          message: "schemeId and schemeName are required for scheme feedback",
        });
      }
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: "rating must be between 1 and 5",
        });
      }
    }

    if (type === "suggestion" && (!suggestionText || !suggestionText.trim())) {
      return res.status(400).json({
        success: false,
        message: "suggestionText is required for suggestions",
      });
    }

    const payload = {
      type,
      mobileNumber: user.mobileNumber,
      voterName: user.name || "",
      schemeId: type === "scheme_feedback" ? schemeId : null,
      schemeName: type === "scheme_feedback" ? schemeName : null,
      rating: type === "scheme_feedback" ? rating : null,
      note: type === "scheme_feedback" ? (note || "") : "",
      suggestionText: type === "suggestion" ? suggestionText.trim() : "",
    };

    const feedback = await Feedback.create(payload);
    res.status(201).json({ success: true, feedback });
  } catch (error) {
    console.error("[Feedback] submitFeedback error:", error);
    res.status(500).json({ success: false, message: "Failed to submit feedback" });
  }
};

/**
 * GET /api/mobile/feedback/my (auth required)
 * Returns the authenticated user's feedback history.
 */
const getMyFeedback = async (req, res) => {
  try {
    const feedback = await Feedback.find({ mobileNumber: req.user.mobileNumber })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, feedback });
  } catch (error) {
    console.error("[Feedback] getMyFeedback error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch feedback" });
  }
};

module.exports = {
  listFeedback,
  getSchemeFeedbackSummary,
  submitFeedback,
  getMyFeedback,
};
