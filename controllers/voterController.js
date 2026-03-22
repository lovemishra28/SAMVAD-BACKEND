const Voter = require("../models/Voter");
const Booth = require("../models/Booth");

const makeMobileNumber = (index) => {
  const base = 7000000000;
  const num = base + index;
  return String(num).padStart(10, "0");
};

const normalizeBoothId = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const boothMatch = raw.match(/^booth[_\s-]?(\d{1,2})$/i);
  if (boothMatch) {
    return `Booth_${String(Number(boothMatch[1])).padStart(2, "0")}`;
  }

  if (/^\d{1,2}$/.test(raw)) {
    return `Booth_${String(Number(raw)).padStart(2, "0")}`;
  }

  return raw;
};

/**
 * GET /api/voters?boothId=<id>
 * Returns voter list for a booth (optionally filtered by boothId).
 */
const getVoters = async (req, res) => {
  try {
    const boothRaw = req.query.boothId || req.query.booth_id || req.query.booth || req.query.id;
    const boothId = normalizeBoothId(boothRaw);

    let voters;
    if (boothId) {
      voters = await Voter.find({ boothId }).lean();
    } else {
      voters = await Voter.find({}).lean();
    }

    const votersWithMobile = voters.map((voter, idx) => ({
      ...voter,
      mobileNumber: voter.mobileNumber || makeMobileNumber(idx),
    }));

    const response = {
      success: true,
      totalVoters: votersWithMobile.length,
      voters: votersWithMobile,
    };

    if (boothId) {
      const booth = await Booth.findOne({ id: boothId }).lean();
      response.booth = booth || null;
    }

    res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch voters",
      error: error.message,
    });
  }
};

module.exports = { getVoters };
