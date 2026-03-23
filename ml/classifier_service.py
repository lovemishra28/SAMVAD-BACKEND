"""
SAMVAD — ML Classification Micro-Service
==========================================
A lightweight Flask API that serves the trained voter classifier model.
Accepts voter features via POST and returns probabilistic category predictions.

Endpoints:
  POST /predict  — Classify one or more voters
  GET  /health   — Health check
  GET  /metadata — Model metadata (accuracy, features, etc.)
"""

from flask import Flask, request, jsonify
import joblib
import numpy as np
import os
import json

# ─── Configuration ───────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "voter_classifier.pkl")
METADATA_PATH = os.path.join(BASE_DIR, "model_metadata.json")
PORT = int(os.environ.get("ML_SERVICE_PORT", 5001))

# ─── Load Model ─────────────────────────────────────────────────────
print("[INFO] Loading ML model...")
try:
    bundle = joblib.load(MODEL_PATH)
    model = bundle["model"]
    label_encoder = bundle["label_encoder"]
    FEATURE_COLS = bundle["feature_columns"]
    CATEGORIES = bundle["categories"]
    print(f"   [OK] Model loaded. Categories: {CATEGORIES}")
except FileNotFoundError:
    print("   [ERROR] Model file not found! Run train_model.py first.")
    model = None
    CATEGORIES = []
    FEATURE_COLS = []

# Load metadata
metadata = {}
try:
    with open(METADATA_PATH, "r") as f:
        metadata = json.load(f)
except FileNotFoundError:
    pass

# ─── Feature Extraction ─────────────────────────────────────────────

def extract_features(voter_data):
    """
    Convert raw voter data dict into the feature vector expected by the model.
    
    Expected input keys:
      - age: int
      - gender: "Male"/"Female"/"Other"
      - area_type: "Rural"/"Semi-Urban"/"Urban"
      - issue: str (booth issue text)
    
    Returns a numpy array of shape (8,) matching FEATURE_COLS.
    """
    age = int(voter_data.get("age", 30))
    
    # Gender encoding
    gender_map = {"Male": 0, "Female": 1, "Other": 2}
    gender_enc = gender_map.get(voter_data.get("gender", "Other"), 2)
    
    # Area type encoding
    area_map = {"Rural": 0, "Semi-Urban": 1, "Urban": 2}
    area_type_enc = area_map.get(voter_data.get("area_type", "Urban"), 1)
    
    # Issue text signals
    issue = (voter_data.get("issue") or "").lower()
    
    issue_student = 1 if any(kw in issue for kw in 
        ["student", "youth", "job", "education"]) else 0
    issue_farmer = 1 if any(kw in issue for kw in 
        ["agriculture", "irrigation", "farmer", "crop", "krishi"]) else 0
    issue_senior = 1 if any(kw in issue for kw in 
        ["senior", "pension", "health", "elderly"]) else 0
    issue_worker = 1 if any(kw in issue for kw in 
        ["employment", "labour", "labor", "entrepreneur", "startup", 
         "transport", "road", "electricity", "waste", "sanitation"]) else 0
    
    # Age bucket
    if age <= 25:
        age_bucket = 0
    elif age <= 40:
        age_bucket = 1
    elif age <= 60:
        age_bucket = 2
    else:
        age_bucket = 3
    
    return np.array([
        age, gender_enc, area_type_enc,
        issue_student, issue_farmer, issue_senior, issue_worker,
        age_bucket
    ])


# ─── Flask App ───────────────────────────────────────────────────────

app = Flask(__name__)


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy" if model is not None else "model_not_loaded",
        "categories": CATEGORIES,
        "port": PORT
    })


@app.route("/metadata", methods=["GET"])
def get_metadata():
    """Return model metadata."""
    return jsonify(metadata)


@app.route("/predict", methods=["POST"])
def predict():
    """
    Classify one or more voters.
    
    Request body:
    {
      "voters": [
        {
          "age": 22,
          "gender": "Male",
          "area_type": "Urban",
          "issue": "Job Opportunities (for Students / Youth)"
        },
        ...
      ]
    }
    
    Response:
    {
      "predictions": [
        {
          "category": "Student",
          "confidence": 0.72,
          "scores": {
            "Student": 0.72,
            "Worker": 0.20,
            "Farmer": 0.05,
            "Senior": 0.00,
            "Others": 0.03
          }
        },
        ...
      ]
    }
    """
    if model is None:
        return jsonify({"error": "Model not loaded. Run train_model.py first."}), 503
    
    data = request.get_json()
    if not data or "voters" not in data:
        return jsonify({"error": "Missing 'voters' array in request body."}), 400
    
    voters = data["voters"]
    if not isinstance(voters, list) or len(voters) == 0:
        return jsonify({"error": "'voters' must be a non-empty array."}), 400
    
    try:
        # Extract features for all voters
        feature_matrix = np.array([extract_features(v) for v in voters])
        
        # Get probability distributions
        probabilities = model.predict_proba(feature_matrix)
        
        # Build response
        predictions = []
        for i, proba in enumerate(probabilities):
            scores = {}
            for cat, prob in zip(CATEGORIES, proba):
                scores[cat] = round(float(prob), 4)
            
            # Find the highest probability category
            best_idx = int(np.argmax(proba))
            category = CATEGORIES[best_idx]
            confidence = round(float(proba[best_idx]), 4)
            
            predictions.append({
                "category": category,
                "confidence": confidence,
                "scores": scores
            })
        
        return jsonify({"predictions": predictions})
    
    except Exception as e:
        return jsonify({"error": f"Prediction failed: {str(e)}"}), 500


# ─── Run Server ──────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"\n[START] SAMVAD ML Classification Service starting on port {PORT}...")
    app.run(host="0.0.0.0", port=PORT, debug=False)

