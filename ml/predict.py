import os
import sys
import json
import joblib
import pandas as pd

# Ensure we load the model relative to this script's location.
model_path = os.path.join(os.path.dirname(__file__), "model.pkl")
model = joblib.load(model_path)

if len(sys.argv) < 2:
    raise SystemExit("Usage: python predict.py <age> <issue> OR python predict.py '[ [age,issue], ... ]'")

raw_input = sys.argv[1]

# sklearn gives a warning if the feature names don't match what the model was trained on.
# Our model was trained on a DataFrame with columns ["age", "issue"], so we do the same.

# Support two modes: single input or batch JSON input.

def _build_df_from_list(data):
    return pd.DataFrame(data, columns=["age", "issue"])

try:
    parsed = json.loads(raw_input)
    if isinstance(parsed, list) and parsed and isinstance(parsed[0], list):
        X = _build_df_from_list(parsed)
    elif isinstance(parsed, list) and parsed and isinstance(parsed[0], dict):
        X = pd.DataFrame(parsed)
    else:
        raise ValueError("Unsupported JSON input format")
except Exception:
    # fallback to legacy positional args
    if len(sys.argv) < 3:
        raise SystemExit("Usage: python predict.py <age> <issue>")
    age = int(raw_input)
    issue = int(sys.argv[2])
    X = _build_df_from_list([[age, issue]])

prediction = model.predict(X)

if len(prediction) == 1:
    print(prediction[0])
else:
    print(json.dumps(prediction.tolist()))
