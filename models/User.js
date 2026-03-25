const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  mobileNumber: {
    type: String,
    required: true,
    unique: true,
    match: /^[0-9]{10}$/,
  },
  name: { type: String, default: "" },
  age: { type: Number, default: 0 },
  gender: {
    type: String,
    enum: ["Male", "Female", "Other", ""],
    default: "",
  },
  occupation: { type: String, default: "" },
  interests: { type: [String], default: [] },
  area_type: {
    type: String,
    enum: ["Urban", "Semi-Urban", "Rural", ""],
    default: "",
  },
  city: { type: String, default: "" },
  boothId: { type: String, default: "" },
  address: { type: String, default: "" },
  incomeRange: {
    type: String,
    enum: ["below_1_5", "1_5_to_3", "3_to_6", "6_to_10", "above_10", ""],
    default: "",
  },
  pwdStatus: { type: Boolean, default: false },
  bplStatus: { type: Boolean, default: false },
  scstStatus: { type: Boolean, default: false },
  eligibilityChecked: { type: Boolean, default: false },
  eligibilityLastUpdated: { type: Date, default: null },
  voterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Voter",
    default: null,
  },
  role: {
    type: String,
    enum: ["citizen", "admin"],
    default: "citizen",
  },
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
