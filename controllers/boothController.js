const { processBoothData } = require("../services/boothService");
const { buildSegments, buildSummary } = require("../services/insightService");
const Booth = require('../models/Booth');
const Voter = require('../models/Voter');

const getBooths = async (req, res) => {
  try {
    const booths = await Booth.find({}).lean();
    const counts = await Voter.aggregate([{ $group: { _id: '$boothId', count: { $sum: 1 } } }]);
    const countMap = counts.reduce((acc, curr) => { acc[curr._id] = curr.count; return acc; }, {});
    booths.forEach(b => { if (countMap[b.id] !== undefined) b.voterCount = countMap[b.id]; });
    res.json({ success: true, booths });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch booths" });
  }
};

const getBooth = async (req, res) => {
  try {
    const { boothId } = req.params;
    if (!boothId) {
      return res.status(400).json({ success: false, message: "Missing boothId" });
    }

    const booth = await Booth.findOne({ id: boothId }).lean();
    if (!booth) {
      return res.status(404).json({ success: false, message: 'Booth not found' });
    }
    booth.voterCount = await Voter.countDocuments({ boothId });
    res.json({ success: true, booth });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch booth" });
  }
};

const analyzeBooth = async (req, res) => {
  try {
    const boothId = req.params.boothId || req.query?.boothId || (req.body && req.body.boothId);

    if (!boothId) {
      return res.status(400).json({
        success: false,
        message: "Missing required field: boothId"
      });
    }

    const { grouped, classificationEngine, context, voters } = await processBoothData(boothId);
    const segments = buildSegments(grouped);
    const summary = buildSummary({ groupedByCategory: grouped, boothIssue: context?.issue });

    res.json({
      success: true,
      classificationEngine,
      segments,
      summary,
      raw: {
        grouped,
        voters,
        context,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Error analyzing booth",
      error: error.message,
    });
  }
};

const processBooth = async (req, res) => {
  try {
    const boothId = (req.body && req.body.boothId) || req.query?.boothId;

    if (!boothId) {
      return res.status(400).json({
        success: false,
        message: "Missing required field: boothId"
      });
    }

    const { grouped, classificationEngine } = await processBoothData(boothId);

    res.json({
      success: true,
      classificationEngine,
      data: grouped
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Error processing booth"
    });
  }
};

module.exports = { getBooths, getBooth, analyzeBooth, processBooth };