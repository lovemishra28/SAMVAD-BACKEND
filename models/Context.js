const mongoose = require("mongoose");

const contextSchema = new mongoose.Schema({
  boothId: String,
  areaType: String, // Urban / Rural
  issue: String
});

module.exports = mongoose.model("Context", contextSchema);
