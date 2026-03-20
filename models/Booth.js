const mongoose = require("mongoose");

const boothSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
  },
  area: {
    type: String,
  },
  district: {
    type: String,
  },
  type: {
    type: String,
    enum: ["Urban", "Rural", "Semi-Urban"],
  },
  lat: {
    type: Number,
  },
  lng: {
    type: Number,
  },
  voterCount: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

module.exports = mongoose.model("Booth", boothSchema);
