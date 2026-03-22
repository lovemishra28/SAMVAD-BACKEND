import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
import joblib
import os
import json

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "..", "data")
VOTERS_DATA_PATH = os.path.join(DATA_DIR, "VotersData.csv")
CONTEXT_DATA_PATH = os.path.join(DATA_DIR, "ContextData.csv")
MODEL_OUTPUT_PATH = os.path.join(BASE_DIR, "voter_classifier.pkl")
METADATA_OUTPUT_PATH = os.path.join(BASE_DIR, "model_metadata.json")

print("Loading ground truth data...")
voters_df = pd.read_csv(VOTERS_DATA_PATH)
context_df = pd.read_csv(CONTEXT_DATA_PATH)

df = voters_df.merge(context_df, on="booth_id", how="inner")
df = df.dropna(subset=["Occupation"])
df = df[df["Occupation"].astype(str).str.strip() != ""]

def extract_issue_signals(issue_text):
    if not isinstance(issue_text, str): return 0, 0, 0, 0
    t = issue_text.lower()
    student = 1 if any(kw in t for kw in ["student", "youth", "job", "education"]) else 0
    farmer  = 1 if any(kw in t for kw in ["agriculture", "farmer", "crop", "krishi"]) else 0
    senior  = 1 if any(kw in t for kw in ["senior", "pension", "health", "elderly"]) else 0
    worker  = 1 if any(kw in t for kw in ["employment", "labour", "worker", "road", "electricity"]) else 0
    return student, farmer, senior, worker

def area_type_to_int(area_type):
    mapping = {"Rural": 0, "Semi-Urban": 1, "Urban": 2}
    if not isinstance(area_type, str): return 1
    return mapping.get(str(area_type).strip(), 1)

def gender_to_int(gender):
    mapping = {"Male": 0, "Female": 1, "Other": 2}
    if not isinstance(gender, str): return 2
    return mapping.get(str(gender).strip(), 2)

def age_to_bucket(age):
    if age <= 25: return 0
    elif age <= 40: return 1
    elif age <= 60: return 2
    else: return 3

df["gender_enc"] = df["gender"].apply(gender_to_int)
area_col = "area_type_x" if "area_type_x" in df.columns else "area_type"
df["area_type_enc"] = df[area_col].apply(area_type_to_int)
df["age_bucket"] = df["age"].apply(age_to_bucket)

issues = df["issue"].apply(extract_issue_signals)
df["issue_student"] = [i[0] for i in issues]
df["issue_farmer"] =  [i[1] for i in issues]
df["issue_senior"] =  [i[2] for i in issues]
df["issue_worker"] =  [i[3] for i in issues]

FEATURE_COLS = ["age", "gender_enc", "area_type_enc", "issue_student", "issue_farmer", "issue_senior", "issue_worker", "age_bucket"]
X = df[FEATURE_COLS].values
y_raw = df["Occupation"].values

le_target = LabelEncoder()
y = le_target.fit_transform(y_raw)
CATEGORIES = list(le_target.classes_)

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

model = RandomForestClassifier(n_estimators=50, max_depth=7, min_samples_split=10, random_state=42, n_jobs=-1)
model.fit(X_train, y_train)

importances = model.feature_importances_

model_bundle = {
    "model": model,
    "label_encoder": le_target,
    "feature_columns": FEATURE_COLS,
    "categories": CATEGORIES,
}
joblib.dump(model_bundle, MODEL_OUTPUT_PATH)
metadata = {
    "categories": CATEGORIES,
    "feature_columns": FEATURE_COLS,
    "training_samples": len(df),
    "feature_importance": {feat: float(imp) for feat, imp in zip(FEATURE_COLS, importances)},
}
with open(METADATA_OUTPUT_PATH, "w") as f:
    json.dump(metadata, f, indent=2)

print("model training process completed successfully")
