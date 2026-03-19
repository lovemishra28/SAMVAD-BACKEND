# SAMVAD Backend

This is the backend server for the **SAMVAD** governance scheme recommendation engine.
It provides an API that takes in booth/voter context and returns personalized scheme recommendations based on age, gender, and issue context.

## 🚀 What it does
- Uses a fast **rule-based scoring engine** (no heavy ML) to compute a probability distribution over categories (Student, Worker, Farmer, Senior)
- Applies **contextual boosts** based on booth issue and gender
- Matches categories + issues to **scheme documents** stored in MongoDB
- Ensures **women receive women-specific schemes** in addition to their primary category

## 🧩 Key folders
- `models/` — Mongoose schemas for Voter, Scheme, Context
- `services/` — Core logic (voter processing, scoring)
- `graph/` — Scheme lookup / matching logic
- `utils/` — Rule-based scoring engine (`categoryEngine.js`)
- `routes/` — Express routes (currently `boothRoutes`)

## ✅ Prerequisites
- Node.js 18+ (recommended)
- MongoDB (local or remote)

## 🛠️ Setup
1. Install dependencies

```bash
npm install
```

2. Start MongoDB (if running locally)

```bash
# Example for a local MongoDB instance
mongod --dbpath /path/to/db
```

3. Run the server

```bash
npm run dev
```

The server listens on port `5000` by default.

## 📡 API
### `GET /`
- Health check

### `GET /booth/:boothId`
- Returns processed voter data grouped by category for a given booth
- Example: `GET /booth/123`

## 🗃️ Data seeding
There is a helper script `importData.js` that can be used to seed voters, contexts, and schemes for demo purposes.

```bash
node importData.js
```

## 🧪 Customization
- Update `config/db.js` to point to your MongoDB URI (default is `mongodb://127.0.0.1:27017/samvad`)
- Add or edit scheme records in the `schemes` collection (fields: `scheme_id`, `scheme_name`, `category`, `issue_targeted`, `description`)

## 📌 Notes
- Gender-based scheme boosts: Female voters always get `Women` category schemes appended (with deduplication)
- Issue filtering is applied when selecting top schemes from the category match

---

If you want to plug-in a real ML model later, the current pipeline is designed to replace the scoring functions in `utils/categoryEngine.js` without changing the overall architecture.
