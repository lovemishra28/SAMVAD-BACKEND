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
  occupation: {
    type: String,
    enum: ['Farmer', 'Student', 'Worker', 'Senior Citizen', ''],
    default: '',
  },
  interests: {
    type: [String],
    default: [],
  },
  mobileNumber: {
    type: String,
    required: true,
    match: /^[0-9]{10}$/,
  },
}, { timestamps: true });

module.exports = mongoose.model("Voter", voterSchema);