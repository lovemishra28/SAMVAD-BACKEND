const jwt = require("jsonwebtoken");
const Voter = require("../models/Voter");
const User = require("../models/User");
const { JWT_SECRET } = require("../middleware/auth");
const twilio = require('twilio');
const dotenv = require('dotenv');
dotenv.config();

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const VALID_OCCUPATIONS = ['Worker', 'Farmer', 'Student', 'Senior Citizen', 'Government Employee'];
const VALID_INTERESTS = [
  'agriculture', 'arts', 'community', 'education', 'environment',
  'finance', 'health', 'sports', 'technology', 'welfare'
];
const VALID_INCOME_RANGES = ['below_1_5', '1_5_to_3', '3_to_6', '6_to_10', 'above_10'];

// ─── Occupation → required eligibility fields mapping ──────────────
const OCCUPATION_FIELDS = {
  'Student':             { incomeRange: true, pwdStatus: true, bplStatus: true, scstStatus: true },
  'Farmer':              { incomeRange: true, pwdStatus: true, bplStatus: true, scstStatus: true },
  'Worker':              { incomeRange: true, pwdStatus: true, bplStatus: true, scstStatus: true },
  'Senior Citizen':      { incomeRange: true, pwdStatus: true, bplStatus: true, scstStatus: true },
  'Government Employee': { incomeRange: true, pwdStatus: true, bplStatus: true, scstStatus: true },
};

// ─── In-memory OTP store (production: use Redis) ───────────────────
// Map<mobileNumber, { code, expiresAt }>
const otpStore = new Map();
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * POST /api/auth/send-otp
 * Body: { mobileNumber: "9876543210" }
 */
const sendOtp = async (req, res) => {
  try {
    const { mobileNumber } = req.body;

    if (!mobileNumber || !/^[0-9]{10}$/.test(mobileNumber)) {
      return res.status(400).json({
        success: false,
        message: "Valid 10-digit mobile number is required",
      });
    }

    // Generate 6-digit OTP
    const code = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(mobileNumber, {
      code,
      expiresAt: Date.now() + OTP_TTL_MS,
    });

    // Send the OTP via Twilio WhatsApp Sandbox
    await twilioClient.messages.create({
      body: `Your SAMVAD login OTP is: ${code}. It expires in 5 minutes.`,
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:+91${mobileNumber}`
    });

    console.log(`\n📱 [OTP] WhatsApp sent to: +91${mobileNumber} (Code: ${code})\n`);

    res.json({ success: true, message: "OTP sent successfully" });
  } catch (error) {
    console.error("[Auth] sendOtp error:", error);
    res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
};

/**
 * POST /api/auth/verify-otp
 * Body: { mobileNumber: "9876543210", otp: "123456" }
 *
 * Flow:
 *   1. Validate OTP
 *   2. Check Voter collection for this mobile
 *   3. If voter not found → 403 (not registered)
 *   4. Find or create User from Voter data
 *   5. Return JWT + user profile + onboarding flags
 */
const verifyOtp = async (req, res) => {
  try {
    const { mobileNumber, otp } = req.body;

    if (!mobileNumber || !otp) {
      return res.status(400).json({
        success: false,
        message: "mobileNumber and otp are required",
      });
    }

    // Validate OTP
    const stored = otpStore.get(mobileNumber);
    if (!stored) {
      return res.status(400).json({
        success: false,
        message: "No OTP requested for this number. Please request a new one.",
      });
    }

    if (Date.now() > stored.expiresAt) {
      otpStore.delete(mobileNumber);
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    if (stored.code !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    // OTP valid — consume it
    otpStore.delete(mobileNumber);

    // Look up voter by mobile number
    const voter = await Voter.findOne({ mobileNumber }).lean();
    if (!voter) {
      return res.status(403).json({
        success: false,
        message: "Mobile number not registered in voter list. Access denied.",
      });
    }

    // Find existing User or auto-create from Voter profile
    let user = await User.findOne({ mobileNumber });

    if (!user) {
      user = await User.create({
        mobileNumber,
        name: voter.name || "",
        age: voter.age || 0,
        gender: voter.gender || "",
        occupation: voter.occupation || "",
        interests: voter.interests || [],
        area_type: voter.area_type || "",
        city: voter.city || "",
        boothId: voter.boothId || "",
        address: voter.address || "",
        voterId: voter._id,
      });
      console.log(`[Auth] New User created from Voter: ${voter.name} (${mobileNumber})`);
    }

    // Generate JWT (30 day expiry for persistent login)
    const token = jwt.sign(
      { userId: user._id, mobileNumber: user.mobileNumber },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    // Determine if user needs onboarding (missing occupation or interests)
    const needsOnboarding = !user.occupation || !user.interests || user.interests.length === 0;
    // Determine if user needs eligibility check
    const needsEligibility = !user.eligibilityChecked;

    res.json({
      success: true,
      message: "OTP verified successfully",
      token,
      needsOnboarding,
      needsEligibility,
      user: {
        _id: user._id,
        name: user.name,
        age: user.age,
        gender: user.gender,
        mobileNumber: user.mobileNumber,
        occupation: user.occupation,
        interests: user.interests,
        area_type: user.area_type,
        city: user.city,
        boothId: user.boothId,
        address: user.address,
        incomeRange: user.incomeRange,
        pwdStatus: user.pwdStatus,
        bplStatus: user.bplStatus,
        scstStatus: user.scstStatus,
        eligibilityChecked: user.eligibilityChecked,
        eligibilityLastUpdated: user.eligibilityLastUpdated,
      },
    });
  } catch (error) {
    console.error("[Auth] verifyOtp error:", error);
    res.status(500).json({ success: false, message: "Verification failed" });
  }
};

/**
 * GET /api/auth/me  (JWT protected)
 * Returns the current user's profile.
 */
const getMe = async (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        _id: req.user._id,
        name: req.user.name,
        age: req.user.age,
        gender: req.user.gender,
        mobileNumber: req.user.mobileNumber,
        occupation: req.user.occupation,
        interests: req.user.interests,
        area_type: req.user.area_type,
        city: req.user.city,
        boothId: req.user.boothId,
        address: req.user.address,
        incomeRange: req.user.incomeRange,
        pwdStatus: req.user.pwdStatus,
        bplStatus: req.user.bplStatus,
        scstStatus: req.user.scstStatus,
        eligibilityChecked: req.user.eligibilityChecked,
        eligibilityLastUpdated: req.user.eligibilityLastUpdated,
      },
    });
  } catch (error) {
    console.error("[Auth] getMe error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch profile" });
  }
};

/**
 * PUT /api/auth/update-profile  (JWT protected)
 * Body: { occupation, interests, incomeRange?, pwdStatus?, bplStatus?, scstStatus? }
 * Updates both Voter and User documents.
 * Validates eligibility fields against occupation-specific rules.
 */
const updateProfile = async (req, res) => {
  try {
    const { occupation, interests, incomeRange, pwdStatus, bplStatus, scstStatus } = req.body;

    // Validate occupation
    if (occupation && !VALID_OCCUPATIONS.includes(occupation)) {
      return res.status(400).json({
        success: false,
        message: `Invalid occupation. Must be one of: ${VALID_OCCUPATIONS.join(', ')}`,
      });
    }

    // Validate interests
    if (interests && Array.isArray(interests)) {
      const invalid = interests.filter(i => !VALID_INTERESTS.includes(i));
      if (invalid.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid interests: ${invalid.join(', ')}. Allowed: ${VALID_INTERESTS.join(', ')}`,
        });
      }
    }

    // Validate income range
    if (incomeRange && !VALID_INCOME_RANGES.includes(incomeRange)) {
      return res.status(400).json({
        success: false,
        message: `Invalid income range. Must be one of: ${VALID_INCOME_RANGES.join(', ')}`,
      });
    }

    const updates = {};
    const effectiveOccupation = occupation || req.user.occupation;

    if (occupation) updates.occupation = occupation;
    if (interests && Array.isArray(interests)) updates.interests = interests;

    // ─── Occupation-based eligibility field validation ─────────────
    const fieldRules = OCCUPATION_FIELDS[effectiveOccupation];

    if (fieldRules) {
      // Only accept fields that are allowed for this occupation
      if (fieldRules.incomeRange && incomeRange) {
        updates.incomeRange = incomeRange;
      } else if (!fieldRules.incomeRange && incomeRange) {
        return res.status(400).json({
          success: false,
          message: `Income range is not applicable for ${effectiveOccupation}`,
        });
      }

      if (fieldRules.pwdStatus && typeof pwdStatus === 'boolean') {
        updates.pwdStatus = pwdStatus;
      } else if (!fieldRules.pwdStatus && typeof pwdStatus === 'boolean') {
        return res.status(400).json({
          success: false,
          message: `PwD status is not applicable for ${effectiveOccupation}`,
        });
      }

      if (fieldRules.bplStatus && typeof bplStatus === 'boolean') {
        updates.bplStatus = bplStatus;
      } else if (!fieldRules.bplStatus && typeof bplStatus === 'boolean') {
        return res.status(400).json({
          success: false,
          message: `BPL status is not applicable for ${effectiveOccupation}`,
        });
      }

      if (fieldRules.scstStatus && typeof scstStatus === 'boolean') {
        updates.scstStatus = scstStatus;
      } else if (!fieldRules.scstStatus && typeof scstStatus === 'boolean') {
        return res.status(400).json({
          success: false,
          message: `SC/ST status is not applicable for ${effectiveOccupation}`,
        });
      }

      // Mark eligibility as checked if occupation is set
      if (occupation || incomeRange !== undefined || pwdStatus !== undefined || bplStatus !== undefined || scstStatus !== undefined) {
        updates.eligibilityChecked = true;
        updates.eligibilityLastUpdated = new Date();
      }

      // Government Employee: auto-mark eligibility done (no fields needed)
      if (effectiveOccupation === 'Government Employee') {
        updates.eligibilityChecked = true;
        updates.eligibilityLastUpdated = new Date();
      }
    }

    // If occupation changed, reset eligibility fields that don't apply to new occupation
    if (occupation && occupation !== req.user.occupation) {
      const newRules = OCCUPATION_FIELDS[occupation];
      if (newRules) {
        if (!newRules.incomeRange) updates.incomeRange = '';
        if (!newRules.pwdStatus) updates.pwdStatus = false;
        if (!newRules.bplStatus) updates.bplStatus = false;
        if (!newRules.scstStatus) updates.scstStatus = false;

        // If switching to Government Employee, auto-complete eligibility
        if (occupation === 'Government Employee') {
          updates.eligibilityChecked = true;
          updates.eligibilityLastUpdated = new Date();
        } else {
          // For other occupation changes, require re-filling eligibility
          updates.eligibilityChecked = false;
        }
      }
    }

    // Update User document
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });

    // Also update Voter document to keep in sync
    await Voter.findOneAndUpdate({ mobileNumber: req.user.mobileNumber }, updates);

    console.log(`[Auth] Profile updated: ${user.name} → occ=${updates.occupation || '(unchanged)'}, eligibility=${user.eligibilityChecked ? 'checked' : 'pending'}`);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        _id: user._id,
        name: user.name,
        age: user.age,
        gender: user.gender,
        mobileNumber: user.mobileNumber,
        occupation: user.occupation,
        interests: user.interests,
        area_type: user.area_type,
        city: user.city,
        boothId: user.boothId,
        address: user.address,
        incomeRange: user.incomeRange,
        pwdStatus: user.pwdStatus,
        bplStatus: user.bplStatus,
        scstStatus: user.scstStatus,
        eligibilityChecked: user.eligibilityChecked,
        eligibilityLastUpdated: user.eligibilityLastUpdated,
      },
    });
  } catch (error) {
    console.error('[Auth] updateProfile error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
};

module.exports = { sendOtp, verifyOtp, getMe, updateProfile, VALID_OCCUPATIONS, VALID_INTERESTS, VALID_INCOME_RANGES, OCCUPATION_FIELDS };
