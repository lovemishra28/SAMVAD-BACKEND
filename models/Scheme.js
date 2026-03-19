const mongoose = require("mongoose");

const schemeSchema = new mongoose.Schema({
  scheme_id: String,
  scheme_name: String,
  category: String,
  issue_targeted: String,
  description: String,
  deadline: String
});

module.exports = mongoose.model("Scheme", schemeSchema);