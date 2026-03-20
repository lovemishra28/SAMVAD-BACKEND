const { getSchemes, getSchemeById, createScheme, getSchemeStatus, getDaysUntilDeadline } = require("../services/schemeService");
const { rebuildGraph } = require("../graph/graphService");

const listSchemes = async (req, res) => {
  try {
    const category = req.query?.category;
    const schemes = await getSchemes(category);
    res.json({ success: true, schemes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to list schemes", error: error.message });
  }
};

const getScheme = async (req, res) => {
  try {
    const schemeId = req.params?.id;
    if (!schemeId) {
      return res.status(400).json({ success: false, message: "Missing scheme id" });
    }
    const scheme = await getSchemeById(schemeId);
    if (!scheme) {
      return res.status(404).json({ success: false, message: "Scheme not found" });
    }
    res.json({ success: true, scheme });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch scheme", error: error.message });
  }
};

const createNewScheme = async (req, res) => {
  try {
    const { scheme_name, category, issue_targeted, description, deadline } = req.body;

    if (!scheme_name || !category || !description) {
      return res.status(400).json({ success: false, message: "Missing required fields: scheme_name, category, description" });
    }

    const scheme = await createScheme({ scheme_name, category, issue_targeted, description, deadline });

    // Rebuild knowledge graph so new scheme is available instantly in recommendations
    rebuildGraph().catch((err) => {
      console.warn("Failed to rebuild knowledge graph after scheme creation", err);
    });

    res.status(201).json({ success: true, scheme });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to create scheme", error: error.message });
  }
};

module.exports = { listSchemes, getScheme, createNewScheme };
