const mongoose = require("mongoose");

const voterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  age: {
    type: Number,
    required: true,
  },
  gender: {
    type: String,
    enum: ["Male", "Female", "Other"],
  },
  boothId: {
    type: String,
    required: true,
  },
  address: {
    type: String,
  },
}, { timestamps: true });

module.exports = mongoose.model("Voter", voterSchema);