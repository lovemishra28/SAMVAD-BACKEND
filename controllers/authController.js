const jwt = require("jsonwebtoken");
const Voter = require("../models/Voter");
const User = require("../models/User");
const { JWT_SECRET } = require("../middleware/auth");

const VALID_OCCUPATIONS = ['Worker', 'Farmer', 'Student', 'Senior Citizen'];
const VALID_INTERESTS = [
  'agriculture', 'arts', 'community', 'education', 'environment',
  'finance', 'health', 'sports', 'technology', 'welfare'
];

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

    // In production, send via SMS gateway (MSG91 / Twilio).
    // For now, log to server console.
    console.log(`\n📱 [OTP] Mobile: ${mobileNumber} → Code: ${code}  (expires in 5 min)\n`);

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
 *   5. Return JWT + user profile
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

    res.json({
      success: true,
      message: "OTP verified successfully",
      token,
      needsOnboarding,
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
      },
    });
  } catch (error) {
    console.error("[Auth] getMe error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch profile" });
  }
};

/**
 * PUT /api/auth/update-profile  (JWT protected)
 * Body: { occupation, interests }
 * Updates both Voter and User documents.
 */
const updateProfile = async (req, res) => {
  try {
    const { occupation, interests } = req.body;

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

    const updates = {};
    if (occupation) updates.occupation = occupation;
    if (interests && Array.isArray(interests)) updates.interests = interests;

    // Update User document
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });

    // Also update Voter document to keep in sync
    await Voter.findOneAndUpdate({ mobileNumber: req.user.mobileNumber }, updates);

    console.log(`[Auth] Profile updated: ${user.name} → occ=${updates.occupation || '(unchanged)'}, interests=${JSON.stringify(updates.interests || '(unchanged)')}`);

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
      },
    });
  } catch (error) {
    console.error('[Auth] updateProfile error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
};

module.exports = { sendOtp, verifyOtp, getMe, updateProfile, VALID_OCCUPATIONS, VALID_INTERESTS };
