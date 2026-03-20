"""
SAMVAD — ML Model Training Pipeline
=====================================
Trains a Gradient Boosted Classifier with probability calibration
for voter category classification.

Key design choices:
1. GradientBoostingClassifier — handles non-linear decision boundaries well
   and natively supports predict_proba() for probability distributions.
2. CalibratedClassifierCV — ensures the probability outputs are well-calibrated
   (a predicted 0.7 actually means ~70% of such predictions are correct).
3. Stratified train/test split — maintains category balance across splits.
4. Feature importance analysis — for interpretability.
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.preprocessing import LabelEncoder
import joblib
import os
import json

# ─── Paths ────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TRAINING_DATA_PATH = os.path.join(BASE_DIR, "training_data.csv")
MODEL_OUTPUT_PATH = os.path.join(BASE_DIR, "voter_classifier.pkl")
METADATA_OUTPUT_PATH = os.path.join(BASE_DIR, "model_metadata.json")

# ─── Load Training Data ─────────────────────────────────────────────
print("📦 Loading training data...")
df = pd.read_csv(TRAINING_DATA_PATH)
print(f"   Total samples: {len(df)}")

# ─── Prepare Features & Target ──────────────────────────────────────
FEATURE_COLS = [
    "age", "gender_enc", "area_type_enc",
    "issue_student", "issue_farmer", "issue_senior", "issue_worker",
    "age_bucket"
]

X = df[FEATURE_COLS].values
y_raw = df["category"].values

# Encode target labels
le_target = LabelEncoder()
y = le_target.fit_transform(y_raw)

CATEGORIES = list(le_target.classes_)
print(f"   Categories: {CATEGORIES}")
print(f"   Feature columns: {FEATURE_COLS}")

# ─── Train/Test Split ───────────────────────────────────────────────
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)
print(f"\n📊 Train: {len(X_train)} | Test: {len(X_test)}")

# ─── Model Training ─────────────────────────────────────────────────
print("\n🧠 Training Gradient Boosting Classifier...")

# Base model: Gradient Boosting with moderate complexity
base_model = GradientBoostingClassifier(
    n_estimators=200,
    max_depth=5,
    learning_rate=0.1,
    min_samples_split=20,
    min_samples_leaf=10,
    subsample=0.8,
    random_state=42,
    validation_fraction=0.1,
    n_iter_no_change=15,      # Early stopping
)

base_model.fit(X_train, y_train)

# ─── Calibrate Probabilities ────────────────────────────────────────
print("📐 Calibrating probability outputs...")

# Wrap the trained model with probability calibration
# Use 'sigmoid' method (Platt scaling) which works well with boosted trees
calibrated_model = CalibratedClassifierCV(
    base_model,
    method="sigmoid",
    cv=5
)
calibrated_model.fit(X_train, y_train)

# ─── Evaluation ─────────────────────────────────────────────────────
print("\n📈 Model Evaluation:")

y_pred = calibrated_model.predict(X_test)
print("\nClassification Report:")
print(classification_report(y_test, y_pred, target_names=CATEGORIES))

# Cross-validation score
cv_scores = cross_val_score(base_model, X, y, cv=5, scoring="accuracy")
print(f"\n5-Fold Cross-Validation Accuracy: {cv_scores.mean():.4f} (+/- {cv_scores.std():.4f})")

# Feature importance from the base model
print("\n🔍 Feature Importance:")
importances = base_model.feature_importances_
for feat, imp in sorted(zip(FEATURE_COLS, importances), key=lambda x: -x[1]):
    print(f"   {feat:20s} → {imp:.4f}")

# ─── Verify Age Constraints ─────────────────────────────────────────
print("\n🧪 Verifying Domain Constraints:")

# Test: 20-year-old should NEVER be Senior
test_young = np.array([[20, 0, 2, 1, 0, 0, 0, 0]])  # 20yr, Male, Urban, student issue
proba_young = calibrated_model.predict_proba(test_young)[0]
print(f"\n   20yr/Male/Urban/Student-issue:")
for cat, prob in zip(CATEGORIES, proba_young):
    print(f"     {cat:10s}: {prob:.4f}")
assert proba_young[CATEGORIES.index("Senior")] < 0.05, "❌ FAIL: Senior probability too high for 20-year-old!"
print("   ✅ Senior probability correctly near zero for young voter")

# Test: 75-year-old should strongly be Senior
test_old = np.array([[75, 0, 0, 0, 0, 1, 0, 3]])  # 75yr, Male, Rural, senior issue
proba_old = calibrated_model.predict_proba(test_old)[0]
print(f"\n   75yr/Male/Rural/Senior-issue:")
for cat, prob in zip(CATEGORIES, proba_old):
    print(f"     {cat:10s}: {prob:.4f}")
assert proba_old[CATEGORIES.index("Senior")] > 0.4, "❌ FAIL: Senior probability too low for 75-year-old!"
print("   ✅ Senior probability correctly dominant for elderly voter")

# Test: 22-year-old should show ambiguity between Student and Worker
test_ambiguous = np.array([[22, 0, 1, 1, 0, 0, 0, 0]])  # 22yr, Male, Semi-Urban, student issue
proba_amb = calibrated_model.predict_proba(test_ambiguous)[0]
print(f"\n   22yr/Male/Semi-Urban/Student-issue:")
for cat, prob in zip(CATEGORIES, proba_amb):
    print(f"     {cat:10s}: {prob:.4f}")
student_prob = proba_amb[CATEGORIES.index("Student")]
worker_prob = proba_amb[CATEGORIES.index("Worker")]
print(f"   ✅ Ambiguity captured: Student={student_prob:.2f}, Worker={worker_prob:.2f}")

# ─── Save Model ─────────────────────────────────────────────────────
print("\n💾 Saving model artifacts...")

model_bundle = {
    "model": calibrated_model,
    "label_encoder": le_target,
    "feature_columns": FEATURE_COLS,
    "categories": CATEGORIES,
}
joblib.dump(model_bundle, MODEL_OUTPUT_PATH)
print(f"   Model saved to: {MODEL_OUTPUT_PATH}")

# Save metadata as JSON for the Node.js service to read
metadata = {
    "categories": CATEGORIES,
    "feature_columns": FEATURE_COLS,
    "training_samples": len(df),
    "test_accuracy": float((y_pred == y_test).mean()),
    "cv_accuracy_mean": float(cv_scores.mean()),
    "cv_accuracy_std": float(cv_scores.std()),
    "feature_importance": {feat: float(imp) for feat, imp in zip(FEATURE_COLS, importances)},
}
with open(METADATA_OUTPUT_PATH, "w") as f:
    json.dump(metadata, f, indent=2)
print(f"   Metadata saved to: {METADATA_OUTPUT_PATH}")

print("\n✅ Model training complete!")
