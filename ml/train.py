import pandas as pd
from sklearn.tree import DecisionTreeClassifier
import joblib

# Sample dataset
data = pd.DataFrame({
    "age": [22, 65, 40, 19, 70, 35],
    "issue": [1, 2, 3, 1, 2, 3],
    "category": ["Student", "Senior", "Farmer", "Student", "Senior", "Farmer"]
})

# Encode target
X = data[["age", "issue"]]
y = data["category"]

# Train model
model = DecisionTreeClassifier()
model.fit(X, y)

# Save model
joblib.dump(model, "model.pkl")

print("Model trained and saved!")