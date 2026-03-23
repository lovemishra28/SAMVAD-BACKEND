"""
SAMVAD — Synthetic Training Data Generator
============================================
Generates domain-expert-curated training data by combining real voter records
with booth context and applying probabilistic labeling rules that encode
age-aware constraints, area-type influence, and issue-based signals.

The key insight: instead of hard rules, we use weighted random sampling
so the model learns SOFT decision boundaries with realistic ambiguity.
"""

import pandas as pd
import numpy as np
import os
import re

np.random.seed(42)

# ─── Paths ────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "..", "data")
OUTPUT_PATH = os.path.join(BASE_DIR, "training_data.csv")

# ─── Load real data ──────────────────────────────────────────────────
voters = pd.read_csv(os.path.join(DATA_DIR, "VotersData.csv"))
context = pd.read_csv(os.path.join(DATA_DIR, "ContextData.csv"))

# Join voter with booth context
df = voters.merge(context, on="booth_id", how="left")

# ─── Feature Extraction Helpers ──────────────────────────────────────

def extract_issue_signals(issue_text):
    """Extract binary signals from booth issue text."""
    if not isinstance(issue_text, str):
        return 0, 0, 0, 0

    t = issue_text.lower()

    issue_student = 1 if any(kw in t for kw in ["student", "youth", "skill", "job", "apprentice", "education"]) else 0
    issue_farmer  = 1 if any(kw in t for kw in ["agriculture", "irrigation", "farmer", "crop", "krishi"]) else 0
    issue_senior  = 1 if any(kw in t for kw in ["senior", "pension", "health", "elderly"]) else 0
    issue_worker  = 1 if any(kw in t for kw in ["employment", "labour", "labor", "entrepreneur", "startup", "transport", "road", "electricity", "waste", "sanitation"]) else 0

    return issue_student, issue_farmer, issue_senior, issue_worker


def age_to_bucket(age):
    """Convert age to ordinal bucket for the model."""
    if age <= 25:
        return 0  # Young
    elif age <= 40:
        return 1  # Mid
    elif age <= 60:
        return 2  # Mature
    else:
        return 3  # Senior


def area_type_to_int(area_type):
    """Encode area type as ordinal integer."""
    mapping = {"Rural": 0, "Semi-Urban": 1, "Urban": 2}
    if not isinstance(area_type, str):
        return 1
    return mapping.get(area_type, 1)


def gender_to_int(gender):
    """Encode gender as integer."""
    mapping = {"Male": 0, "Female": 1, "Other": 2}
    if not isinstance(gender, str):
        return 2
    return mapping.get(gender, 2)


# ─── Probabilistic Labeling Engine ───────────────────────────────────

CATEGORIES = ["Student", "Worker", "Farmer", "Senior Citizen"]

def compute_category_probabilities(age, gender_enc, area_type_enc, 
                                     issue_student, issue_farmer, 
                                     issue_senior, issue_worker):
    """
    Compute a probability distribution over categories using domain knowledge.
    
    This function encodes soft constraints:
    - Age < 18 or > 30: Student probability drops sharply
    - Age < 55: Senior probability is near zero
    - Rural + agriculture issue: Farmer probability boosted
    - Urban + job issue: Student/Worker probability boosted
    
    Returns a probability vector over [Student, Worker, Farmer, Senior Citizen].
    """
    # Start with uniform base weights
    weights = np.array([1.0, 1.0, 1.0, 1.0])  # Student, Worker, Farmer, Senior Citizen
    
    # ═══ Age-based constraints (the core domain intelligence) ═══
    
    if age <= 20:
        # Very young: primarily students
        weights[0] = 8.0   # Student
        weights[1] = 2.0   # Worker (part-time job possible)
        weights[2] = 0.5   # Farmer (unlikely for very young)
        weights[3] = 0.0   # Senior Citizen (impossible)
        
    elif age <= 25:
        # Young adults: could be students or young workers
        weights[0] = 5.0   # Student  
        weights[1] = 4.0   # Worker
        weights[2] = 1.5   # Farmer (possible in rural)
        weights[3] = 0.0   # Senior Citizen (impossible)
        
    elif age <= 35:
        # Working age: primarily workers
        weights[0] = 1.5   # Student (post-grad possible)
        weights[1] = 6.0   # Worker
        weights[2] = 3.0   # Farmer
        weights[3] = 0.0   # Senior Citizen (impossible)
        
    elif age <= 50:
        # Mid-career: workers and farmers
        weights[0] = 0.2   # Student (very unlikely)
        weights[1] = 5.0   # Worker
        weights[2] = 4.5   # Farmer
        weights[3] = 0.1   # Senior Citizen (not yet)
        
    elif age <= 60:
        # Pre-retirement: workers, farmers, approaching senior
        weights[0] = 0.05  # Student (nearly impossible)
        weights[1] = 4.0   # Worker
        weights[2] = 4.0   # Farmer
        weights[3] = 2.0   # Senior Citizen (getting closer)  
        
    elif age <= 70:
        # Senior range
        weights[0] = 0.0   # Student (impossible)
        weights[1] = 1.5   # Worker (some still work)
        weights[2] = 2.0   # Farmer (some still farm)
        weights[3] = 7.0   # Senior Citizen
        
    else:
        # Elderly
        weights[0] = 0.0   # Student (impossible)
        weights[1] = 0.5   # Worker (rare)
        weights[2] = 1.0   # Farmer (possible)
        weights[3] = 9.0   # Senior Citizen (very likely)

    # ═══ Area type modifiers ═══
    
    if area_type_enc == 0:  # Rural
        weights[2] *= 2.0   # Boost Farmer
        weights[0] *= 0.7   # Slightly reduce Student
    elif area_type_enc == 2:  # Urban
        weights[1] *= 1.5   # Boost Worker
        weights[0] *= 1.3   # Boost Student
        weights[2] *= 0.4   # Reduce Farmer significantly

    # ═══ Booth issue signal modifiers ═══
    
    if issue_student:
        weights[0] *= 2.0   # Strong boost for Student
        weights[1] *= 1.3   # Moderate boost for Worker (job-related)
        
    if issue_farmer:
        weights[2] *= 2.5   # Strong boost for Farmer
        
    if issue_senior:
        if age >= 50:
            weights[3] *= 2.0   # Boost Senior Citizen only if age-appropriate
        weights[1] *= 1.1   # Healthcare interests workers too
        
    if issue_worker:
        weights[1] *= 1.8   # Boost Worker

    # ═══ Normalize to probabilities ═══
    weights = np.maximum(weights, 0)  # Ensure non-negative
    total = weights.sum()
    if total == 0:
        return np.array([0.25, 0.25, 0.25, 0.25])
    
    probabilities = weights / total
    return probabilities


# ─── Generate Training Dataset ──────────────────────────────────────

print("🔧 Generating training data from real voter records...")

records = []

for _, row in df.iterrows():
    age = int(row["age"])
    gender_enc = gender_to_int(row.get("gender", "Other"))
    area_type_enc = area_type_to_int(row.get("area_type"))
    issue_student, issue_farmer, issue_senior, issue_worker = extract_issue_signals(row.get("issue"))
    age_bucket = age_to_bucket(age)
    
    # Compute probability distribution
    probs = compute_category_probabilities(
        age, gender_enc, area_type_enc,
        issue_student, issue_farmer, issue_senior, issue_worker
    )
    
    # Sample the category from the probability distribution
    # This creates realistic ambiguity in the training data
    category = np.random.choice(CATEGORIES, p=probs)
    
    records.append({
        "age": age,
        "gender_enc": gender_enc,
        "area_type_enc": area_type_enc,
        "issue_student": issue_student,
        "issue_farmer": issue_farmer,
        "issue_senior": issue_senior,
        "issue_worker": issue_worker,
        "age_bucket": age_bucket,
        "category": category
    })

# Create base dataset from real records
base_df = pd.DataFrame(records)
print(f"  ✅ Base dataset: {len(base_df)} records")

# ─── Data Augmentation ──────────────────────────────────────────────
# Generate additional synthetic samples with slight noise to improve
# model generalization and create smoother decision boundaries.

print("🔧 Augmenting dataset with synthetic samples...")

augmented_records = []
AUGMENTATION_FACTOR = 4  # Generate 4x more synthetic samples

for _ in range(AUGMENTATION_FACTOR):
    for _, row in base_df.iterrows():
        # Add slight noise to age (±2 years, clamped to valid range)
        noisy_age = int(np.clip(row["age"] + np.random.randint(-2, 3), 18, 90))
        age_bucket = age_to_bucket(noisy_age)
        
        # Randomly flip some issue signals with low probability (5%)
        is_s = row["issue_student"] if np.random.random() > 0.05 else 1 - row["issue_student"]
        is_f = row["issue_farmer"] if np.random.random() > 0.05 else 1 - row["issue_farmer"]
        is_sr = row["issue_senior"] if np.random.random() > 0.05 else 1 - row["issue_senior"]
        is_w = row["issue_worker"] if np.random.random() > 0.05 else 1 - row["issue_worker"]
        
        # Recompute probabilities with noisy features
        probs = compute_category_probabilities(
            noisy_age, row["gender_enc"], row["area_type_enc"],
            is_s, is_f, is_sr, is_w
        )
        category = np.random.choice(CATEGORIES, p=probs)
        
        augmented_records.append({
            "age": noisy_age,
            "gender_enc": int(row["gender_enc"]),
            "area_type_enc": int(row["area_type_enc"]),
            "issue_student": int(is_s),
            "issue_farmer": int(is_f),
            "issue_senior": int(is_sr),
            "issue_worker": int(is_w),
            "age_bucket": age_bucket,
            "category": category
        })

augmented_df = pd.DataFrame(augmented_records)
final_df = pd.concat([base_df, augmented_df], ignore_index=True)

# Shuffle the dataset
final_df = final_df.sample(frac=1, random_state=42).reset_index(drop=True)

print(f"  ✅ Augmented dataset: {len(final_df)} records")
print(f"\n📊 Category Distribution:")
print(final_df["category"].value_counts().to_string())

# Save
final_df.to_csv(OUTPUT_PATH, index=False)
print(f"\n💾 Saved training data to: {OUTPUT_PATH}")
