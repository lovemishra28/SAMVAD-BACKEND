/**
 * SAMVAD — ML Classifier Client
 * ================================
 * Node.js client for the Python ML Classification micro-service.
 * 
 * Features:
 *   - Batch prediction support (sends all voters in one HTTP call)
 *   - Automatic fallback to rule-based engine if ML service is unavailable
 *   - Connection health monitoring
 *   - Configurable timeout and retry logic
 */

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:5001";
const ML_TIMEOUT_MS = parseInt(process.env.ML_TIMEOUT_MS || "10000");

/**
 * Check if the ML service is healthy and reachable.
 * @returns {Promise<boolean>}
 */
const isServiceHealthy = async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${ML_SERVICE_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return false;
    const data = await response.json();
    return data.status === "healthy";
  } catch {
    return false;
  }
};

/**
 * Classify voters using the ML model.
 * 
 * @param {Array<Object>} voters - Array of voter objects with:
 *   - age: number
 *   - gender: "Male" | "Female" | "Other"
 *   - area_type: "Rural" | "Semi-Urban" | "Urban"
 *   - issue: string (booth issue text)
 * 
 * @returns {Promise<Array<Object>>} Array of prediction objects with:
 *   - category: string (predicted category)
 *   - confidence: number (0..1)
 *   - scores: { Student: number, Worker: number, Farmer: number, Senior: number, Others: number }
 * 
 * @throws {Error} If the ML service is unreachable or returns an error
 */
const classifyVoters = async (voters) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);

  try {
    const response = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voters }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `ML service returned ${response.status}`);
    }

    const data = await response.json();
    return data.predictions;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new Error("ML service request timed out");
    }
    throw err;
  }
};

/**
 * Classify a single voter. Convenience wrapper around classifyVoters.
 */
const classifyVoter = async (voterData) => {
  const predictions = await classifyVoters([voterData]);
  return predictions[0];
};

/**
 * Get model metadata from the ML service (accuracy, features, etc.).
 */
const getModelMetadata = async () => {
  const response = await fetch(`${ML_SERVICE_URL}/metadata`);
  if (!response.ok) throw new Error("Failed to fetch model metadata");
  return response.json();
};

module.exports = {
  classifyVoters,
  classifyVoter,
  isServiceHealthy,
  getModelMetadata,
};
