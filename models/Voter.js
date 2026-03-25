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
  city: {
    type: String,
    default: "",
  },
  area_type: {
    type: String,
    enum: ["Urban", "Semi-Urban", "Rural"],
  },
  address: {
    type: String,
  },
  occupation: {
    type: String,
    enum: ['Farmer', 'Student', 'Worker', 'Senior Citizen', 'Government Employee', ''],
    default: '',
  },
  interests: {
    type: [String],
    default: [],
  },
  incomeRange: {
    type: String,
    enum: ['below_1_5', '1_5_to_3', '3_to_6', '6_to_10', 'above_10', ''],
    default: '',
  },
  pwdStatus: {
    type: Boolean,
    default: false,
  },
  bplStatus: {
    type: Boolean,
    default: false,
  },
  scstStatus: {
    type: Boolean,
    default: false,
  },
  eligibilityChecked: {
    type: Boolean,
    default: false,
  },
  eligibilityLastUpdated: {
    type: Date,
    default: null,
  },
  mobileNumber: {
    type: String,
    required: true,
    match: /^[0-9]{10}$/,
  },
}, { timestamps: true });

module.exports = mongoose.model("Voter", voterSchema);