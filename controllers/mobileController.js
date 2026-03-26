const fs = require('fs');
const path = require('path');
const Scheme = require("../models/Scheme");
const Application = require("../models/Application");
const NotificationDelivery = require("../models/NotificationDelivery");

/**
 * GET /api/mobile/notifications
 * Returns personalized notifications for the authenticated user.
 * Resolves scheme names → scheme IDs from the Scheme collection.
 */
const getNotifications = async (req, res) => {
  try {
    const { mobileNumber } = req.user;

    const deliveries = await NotificationDelivery.find({ mobileNumber })
      .sort({ sentAt: -1 })
      .limit(50)
      .lean();

    // Enrich with full scheme details where possible
    const allSchemeIds = [...new Set(deliveries.flatMap(d => d.schemeIds))];
    const schemes = await Scheme.find({ scheme_id: { $in: allSchemeIds } }).lean();
    const schemeMap = {};
    schemes.forEach(s => { schemeMap[s.scheme_id] = s; });

    const notifications = deliveries.map(d => ({
      _id: d._id,
      isUnread: d.isUnread === false ? false : !(d.readAt || d.viewedAt),
      viewedAt: d.viewedAt || null,
      readAt: d.readAt || null,
      schemeNames: d.schemeNames,
      schemeIds: d.schemeIds,
      category: d.category,
      boothId: d.boothId,
      relevanceScores: d.relevanceScores,
      sentAt: d.sentAt,
      // Resolve to full scheme objects for display
      schemes: d.schemeIds.map((id, i) => {
        const full = schemeMap[id];
        return {
          schemeId: id,
          schemeName: d.schemeNames[i] || (full && full.scheme_name) || "Unknown",
          description: full ? full.description : "",
          benefit_type: full ? full.benefit_type : "",
          eligibility: full ? full.eligibility : "",
          area_type: full ? full.area_type : "",
          end_date: full ? full.end_date : "",
        };
      }),
    }));

    const unreadCount = notifications.filter(n => n.isUnread).length;

    res.json({ success: true, notifications, unreadCount });
  } catch (error) {
    console.error("[Mobile] getNotifications error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch notifications" });
  }
};

/**
 * GET /api/mobile/schemes
 * Returns active schemes relevant to the authenticated user's occupation + area.
 */
const getSchemes = async (req, res) => {
  try {
    const { occupation, area_type, mobileNumber,
            incomeRange, pwdStatus, bplStatus, scstStatus } = req.user;
    const now = new Date();

    // Government Employee → no schemes
    if (occupation === 'Government Employee') {
      return res.json({ success: true, schemes: [] });
    }

    // Build query: match occupation + area (or "All")
    const query = {};
    if (occupation) {
      query.target_occupation = occupation;
    }

    let schemes = await Scheme.find(query).lean();

    // Filter by area
    if (area_type) {
      schemes = schemes.filter(s => {
        const sa = (s.area_type || "All").trim();
        return sa === "All" || sa === "Both" || sa === area_type;
      });
    }

    // Filter active
    schemes = schemes.filter(s => {
      const startOk = !s.start_date || new Date(s.start_date) <= now;
      const endOk = !s.end_date || new Date(s.end_date) >= now;
      return startOk && endOk;
    });

    // ── ELIGIBILITY PRE-FILTER ──
    const INCOME_ORDER = { 'below_1_5': 0, '1_5_to_3': 1, '3_to_6': 2, '6_to_10': 3, 'above_10': 4 };
    schemes = schemes.filter(s => {
      const elig = s.eligibility || {};
      // BPL gate
      if (elig.requiresBpl === true && bplStatus !== true) return false;
      // SC/ST gate
      if (elig.requiresScst === true && scstStatus !== true) return false;
      // PwD gate
      if (elig.requiresPwd === true && pwdStatus !== true) return false;
      // Income cap
      if (elig.maxIncomeBracket && incomeRange) {
        const schemeMax = INCOME_ORDER[elig.maxIncomeBracket];
        const userIncome = INCOME_ORDER[incomeRange];
        if (schemeMax !== undefined && userIncome !== undefined && userIncome > schemeMax) return false;
      }
      return true;
    });

    // Sort by priority
    schemes.sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));

    const schemeIds = schemes.map(s => s.scheme_id).filter(Boolean);
    const applications = await Application.find({
      voterId: mobileNumber,
      schemeId: { $in: schemeIds },
    }).lean();

    const appMap = {};
    applications.forEach(a => {
      appMap[a.schemeId] = a;
    });

    const schemesWithStatus = schemes.map(s => {
      const app = appMap[s.scheme_id];
      return {
        ...s,
        isApplied: !!app,
        appliedAt: app ? app.appliedAt : null,
        applicationStatus: app ? app.status : null,
      };
    });

    res.json({ success: true, schemes: schemesWithStatus });
  } catch (error) {
    console.error("[Mobile] getSchemes error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch schemes" });
  }
};

/**
 * POST /api/mobile/apply
 * Body: { schemeId, schemeName, comments? }
 * Creates an Application record. Blocks duplicate (same user + scheme).
 */
const applyForScheme = async (req, res) => {
  try {
    const {
      schemeId,
      schemeName,
      comments,
      applicantName,
      applicantMobileNumber,
      applicantAddress,
      schemeWebsiteLink,
    } = req.body;
    const user = req.user;

    if (!schemeId || !schemeName) {
      return res.status(400).json({
        success: false,
        message: "schemeId and schemeName are required",
      });
    }

    const existing = await Application.findOne({ voterId: user.mobileNumber, schemeId }).lean();
    if (existing) {
      return res.status(200).json({
        success: true,
        alreadyApplied: true,
        message: "You have already applied for this scheme",
        application: existing,
      });
    }

    const applicationPayload = {
      schemeId,
      schemeName,
      voterId: user.mobileNumber,
      voterName: applicantName || user.name,
      category: user.occupation || "citizen",
      status: "applied",
      appliedAt: new Date(),
      portalReference: comments || schemeWebsiteLink || "",
      applicantAddress: applicantAddress || "",
    };

    const application = await Application.create(applicationPayload);

    res.status(201).json({ success: true, alreadyApplied: false, application });
  } catch (error) {
    if (error && error.code === 11000) {
      const existing = await Application.findOne({
        voterId: req.user.mobileNumber,
        schemeId: req.body.schemeId,
      }).lean();

      return res.status(200).json({
        success: true,
        alreadyApplied: true,
        message: "You have already applied for this scheme",
        application: existing,
      });
    }

    console.error("[Mobile] applyForScheme error:", error);
    res.status(500).json({ success: false, message: "Failed to submit application" });
  }
};

/**
 * GET /api/mobile/schemes/:schemeId/applied-status
 * Returns whether current user has already applied to the given scheme.
 */
const getSchemeAppliedStatus = async (req, res) => {
  try {
    const { schemeId } = req.params;
    const application = await Application.findOne({
      voterId: req.user.mobileNumber,
      schemeId,
    }).lean();

    res.json({
      success: true,
      schemeId,
      isApplied: !!application,
      application: application || null,
    });
  } catch (error) {
    console.error("[Mobile] getSchemeAppliedStatus error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch applied status" });
  }
};

/**
 * GET /api/mobile/applications
 * Returns the authenticated user's application history.
 */
const getApplications = async (req, res) => {
  try {
    const applications = await Application.find({ voterId: req.user.mobileNumber })
      .sort({ appliedAt: -1 })
      .lean();

    // Enrich with scheme details
    const schemeIds = [...new Set(applications.map(a => a.schemeId))];
    const schemes = await Scheme.find({ scheme_id: { $in: schemeIds } }).lean();
    const schemeMap = {};
    schemes.forEach(s => { schemeMap[s.scheme_id] = s; });

    const enriched = applications.map(a => {
      const full = schemeMap[a.schemeId];
      return {
        ...a,
        schemeDetails: full ? {
          description: full.description,
          benefit_type: full.benefit_type,
          eligibility: full.eligibility,
          end_date: full.end_date,
          scheme_name: full.scheme_name,
        } : null,
      };
    });

    res.json({ success: true, applications: enriched });
  } catch (error) {
    console.error("[Mobile] getApplications error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch applications" });
  }
};

/**
 * GET /api/mobile/my-recommendations
 * Parses notification_log.md for the authenticated user's mobile number.
 * Returns matched scheme names + relevance scores.
 */
const getMyRecommendations = async (req, res) => {
  try {
    const { mobileNumber } = req.user;

    const deliveries = await NotificationDelivery.find({ mobileNumber })
      .sort({ sentAt: -1 })
      .lean();

    if (!deliveries || deliveries.length === 0) {
      return res.json({ success: true, found: false, schemes: [] });
    }

    const matches = [];
    const seen = new Set();

    for (const delivery of deliveries) {
      const schemeNames = delivery.schemeNames || [];
      const scoreMap = {};

      if (delivery.relevanceScores) {
        // Parse relevance scores: "SchemeName(XX%), SchemeName(YY%)"
        const scoreParts = delivery.relevanceScores.split(',').map(s => s.trim());
        for (const part of scoreParts) {
          const match = part.match(/^(.+?)\((\d+)%\)$/);
          if (match) {
            scoreMap[match[1].trim()] = parseInt(match[2], 10);
          }
        }
      }

      for (const name of schemeNames) {
        if (seen.has(name)) continue;
        seen.add(name);
        matches.push({
          schemeName: name,
          relevanceScore: scoreMap[name] || 0,
        });
      }
    }

    // Sort by relevance score descending
    matches.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Fetch full scheme details from DB based on names
    const namesArray = matches.map(m => m.schemeName);
    const fullSchemes = await Scheme.find({ scheme_name: { $in: namesArray } }).lean();
    const schemeMap = {};
    fullSchemes.forEach(s => {
      schemeMap[s.scheme_name] = s;
    });

    const enrichedMatches = matches.map(m => {
      const full = schemeMap[m.schemeName];
      if (full) {
        return {
          ...m,
          scheme_id: full.scheme_id,
          schemeId: full.scheme_id, // include both formats just in case
          description: full.description,
          benefit_type: full.benefit_type,
          eligibility: full.eligibility,
          end_date: full.end_date,
          target_occupation: full.target_occupation,
          target_interest: full.target_interest,
        };
      }
      return m;
    });

    res.json({
      success: true,
      found: enrichedMatches.length > 0,
      schemes: enrichedMatches,
    });
  } catch (error) {
    console.error('[Mobile] getMyRecommendations error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch recommendations' });
  }
};

/**
 * PATCH /api/mobile/notifications/mark-all-read
 * Marks all unread notifications as read for current user.
 */
const markAllNotificationsRead = async (req, res) => {
  try {
    const { mobileNumber } = req.user;
    const now = new Date();

    const result = await NotificationDelivery.updateMany(
      {
        mobileNumber,
        $or: [
          { isUnread: true },
          { isUnread: { $exists: false }, readAt: null },
        ],
      },
      { $set: { isUnread: false, viewedAt: now, readAt: now } }
    );

    res.json({
      success: true,
      modifiedCount: result.modifiedCount || 0,
    });
  } catch (error) {
    console.error("[Mobile] markAllNotificationsRead error:", error);
    res.status(500).json({ success: false, message: "Failed to mark notifications as read" });
  }
};

module.exports = {
  getNotifications,
  getSchemes,
  applyForScheme,
  getSchemeAppliedStatus,
  getApplications,
  getMyRecommendations,
  markAllNotificationsRead,
};
