const express = require("express");
const router = express.Router();

const { processBooth } = require("../controllers/boothController");

router.post("/process", processBooth);

module.exports = router;