const { processBoothData } = require("../services/boothService");

const processBooth = async (req, res) => {
  try {
    const boothId = (req.body && req.body.boothId) || req.query?.boothId;

    if (!boothId) {
      return res.status(400).json({
        success: false,
        message: "Missing required field: boothId"
      });
    }

    const result = await processBoothData(boothId);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Error processing booth"
    });
  }
};

module.exports = { processBooth };