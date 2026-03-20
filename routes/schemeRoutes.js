const express = require("express");
const router = express.Router();

const { listSchemes, getScheme, createNewScheme } = require("../controllers/schemeController");

// GET /api/schemes?category=<category>
router.get("/", listSchemes);

// GET /api/schemes/:id
router.get("/:id", getScheme);

// POST /api/schemes
router.post("/", createNewScheme);

module.exports = router;
