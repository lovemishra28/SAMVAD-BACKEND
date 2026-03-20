const Voter = require("../models/Voter");
const Booth = require("../models/Booth");

/**
 * GET /api/voters?boothId=<id>
 * Returns voter list for a booth (optionally filtered by boothId).
 */
const getVoters = async (req, res) => {
  try {
    const boothId = req.query.boothId;

    let voters;
    if (boothId) {
      voters = await Voter.find({ boothId }).lean();
    } else {
      voters = await Voter.find({}).lean();
    }

    const response = {
      success: true,
      totalVoters: voters.length,
      voters,
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
