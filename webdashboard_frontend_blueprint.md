# SAMVAD Frontend Blueprint

> This document describes the full **frontend architecture** for the SAMVAD dashboard. It is designed to help backend engineers understand the component breakdown, data flow, storage expectations, and where to wire in backend APIs.

---

## 🎯 High-Level Overview

SAMVAD is built as a **Next.js (App Router) single-page dashboard** that simulates an AI-powered voter intelligence system.

### Primary user journey (flow)
1. **Booth Selection** (`/booth-selection`) – pick a booth (auto-detection by geo or manual selection).
2. **Fetch Data** (`/fetch-data`) – simulate retrieving voter records for the selected booth (calls `/api/voters`).
3. **Processing** (`/processing`) – simulate AI segmentation, analytics, and insight generation.
4. **Dashboard** (`/dashboard`) – show segmented voter categories, charts, and scheme recommendations.
5. **Notification Engine** (`/notifications`) – send scheme notifications to voter categories.
6. **Scheme Management** (`/schemes` + `/schemes/[id]`) – manage scheme catalogs and inspect details + campaign tracking.

The frontend is intentionally **mocked/simulated**, relying heavily on local storage and in-memory logic to fake a “full system”. The backend should provide real data and persistence where currently mocked.

---

## 📁 File / Folder Structure (Frontend)

```
src/
  app/
    layout.tsx              # Root page layout + global navigation (header + BoothIndicator)
    page.tsx                # Redirects to /booth-selection

    booth-selection/        # Booth selection + map + booth chooser
      page.js

    fetch-data/             # Data retrieval progress + API call
      page.js

    processing/             # AI analysis progress simulator
      page.js

    dashboard/              # Main dashboard (charts + segments + scheme recommendations)
      page.js

    notifications/          # Notification Engine (bulk dispatch simulation + persistence)
      page.js

    schemes/                # Scheme list page
      page.js
      [id]/
        page.js             # Scheme detail page (campaigns + tracking + applications)

    api/                    # Next.js route handlers (mock API)
      voters/               # Endpoint used by FetchData page
        route.js

  components/               # UI components (charts, progress bar, back button, etc.)
    AgeChart.js
    BackButton.js
    BoothIndicator.js
    CategoryChart.js
    ProgressBar.js

  lib/                      # Business logic helpers (segmentation, schemes, campaigns, notifications)
    applicationTracker.js
    campaignEngine.js
    generateInsight.js
    getSchemes.js
    notificationStore.js
    schemesData.js
    segmentVoters.js

---

## 🧠 Core Frontend Data Flow (State + Persistence)

### Local storage keys (single source of truth across pages)
- `boothId` (string) – selected booth ID (e.g., `B101`).
- `boothMeta` (JSON object) – booth metadata (id, area, district, type, lat/lng, voter count).
- `voters` (JSON array) – voter list retrieved from `/api/voters`.
- `samvad-notification-history` (JSON object) – used by notification engine and schemes dashboard.
- `campaigns-{schemeId}` (JSON array) – stored per scheme (campaign dispatch history and logs).
- `applications-{schemeId}` (JSON array) – simulated application tracking data used by scheme details.

> **Note:** The backend should eventually replace localStorage persistence with a proper database and API endpoints.

---

## 🔌 Current Backend Contract (What Frontend Calls Today)

### ✅ Existing API endpoint
- `GET /api/voters`
  - **Consumes:** none
  - **Returns:**
    ```json
    {
      "booth": "B101",
      "totalVoters": 24,
      "voters": [
        { "name": "Ramesh Kumar", "age": 48, "occupation": "Farmer" },
        ...
      ]
    }
    ```
  - **Used by:** `src/app/fetch-data/page.js`
  - **Expectation:** the endpoint must respond quickly with a list of voters for the selected booth.

### 🔧 Where to plug in backend services
The frontend currently uses mocks and local persistence; a backend should provide the following capabilities:

#### Booths & Locations
- `GET /api/booths` (or `GET /api/voters?boothId=...`) to return booth list + geolocation.
- Should include fields: `id`, `name`, `area`, `district`, `type`, `lat`, `lng`, `voters` (count).

#### Voter Records
- `GET /api/voters?boothId=<id>` (preferred) to return voters for a booth.
- Voter record shape:
  - `name` (string)
  - `age` (number)
  - `occupation` (string)
  - (optional) `phone`, `address`, `id` etc.

#### Scheme Catalog
- `GET /api/schemes` – list of schemes with metadata.
- `GET /api/schemes/:id` – detail for a scheme.

#### Campaign / Notifications
- `POST /api/notifications` (or `POST /api/campaigns`) to trigger a campaign send.
- `GET /api/notifications?category=<cat>` to list sent notifications.
- `GET /api/campaigns?schemeId=<id>` to return campaign history.

#### Application Tracking (Optional)
- `GET /api/applications?schemeId=<id>`: returns application status for the scheme.
- `POST /api/applications` to record new application actions (in the future).

---

## 🔍 Page-by-Page Responsibilities

### `/booth-selection`
- **File:** `src/app/booth-selection/page.js`
- **Core:** choose a booth (map+dropdown+manual entry), store selection in `localStorage`, navigate to `/fetch-data`.
- **Existing data:** a hardcoded `BOOTHS` array.
- **Important state:** `boothId`, `manualId`, `confirmed`, `autoDetecting`, `userLocation`.
- **Map:** uses Leaflet via dynamic import (`react-leaflet`) for client side only.

### `/fetch-data`
- **File:** `src/app/fetch-data/page.js`
- **Core:** fetch voter list from `/api/voters`, store in `localStorage`, simulate progress stages.
- **Persistence:** writes `voters` into localStorage.
- **Navigation:** redirects to `/processing` after completion.

### `/processing`
- **File:** `src/app/processing/page.js`
- **Core:** simulate AI analysis and write progress UI; does NOT call backend.
- **Requirement:** requires `voters` in localStorage or it redirects to `/booth-selection`.
- **Next:** navigates to `/dashboard` when complete.

### `/dashboard`
- **File:** `src/app/dashboard/page.js`
- **Core:** reads `voters` from localStorage, segments using `segmentVoters()`, generates insights using `generateInsight()`, and displays charts and recommended schemes.
- **Key data flow:**
  - segmentation result stored in `segments` state
  - `boothInsightText` from `generateInsight(voters, segments)`
  - `getSchemes(category)` provides scheme recommendation list

### `/notifications`
- **File:** `src/app/notifications/page.js`
- **Core:** user selects a category, sends notifications to that category (simulated), and persists a notification record via `notificationStore.saveNotificationRecord()`.
- **Persistence:** uses `samvad-notification-history` in localStorage.
- **Important helpers:** `getUnnotifiedSchemes`, `getLatestNotification`, `getNotificationSummary`.

### `/schemes`
- **File:** `src/app/schemes/page.js`
- **Core:** lists available schemes from `SCHEMES_DATABASE`, offers filtering, searching, and new scheme creation (client-only, in-memory).
- **Notification status:** pulls summary using `notificationStore` helpers.

### `/schemes/[id]`
- **File:** `src/app/schemes/[id]/page.js`
- **Core:** scheme detail page with multiple tabs:
  - Overview: scheme details, target voters, notification history.
  - Campaign Control: create launch/reminder campaigns via `campaignEngine`, simulate deliveries, and store campaigns in localStorage.
  - Tracking: show delivery analytics (charts).
  - Applications: simulate adoption using `applicationTracker`.

---

## 🧩 Core Business Logic Libraries (`src/lib`)

### `segmentVoters.js`
- Segments voters into categories:
  - Farmers (occupation === "Farmer")
  - Students (age < 25)
  - Senior Citizens (age > 60)
  - Workers (occupation === "Worker")
  - Others (all remaining)

### `getSchemes.js`
- Returns a list of scheme names keyed by category (Farmers / Students / etc).
- Used for recommending schemes on the dashboard and notifications.

### `generateInsight.js`
- Produces a one-line summary (dominant category, avg age).
- Used in dashboard top section.

### `schemesData.js`
- Primary scheme catalog (hardcoded array `SCHEMES_DATABASE`).
- Helpers: `getSchemesByCategory`, `getSchemeById`, `getAllCategories`, `getSchemeStatus`, `getDaysUntilDeadline`.
- Used by `/schemes` and `/schemes/[id]`.

### `campaignEngine.js`
- Simulates launching and reminding campaign objects.
- Generates fake delivery logs and computes analytics.
- Used by `/schemes/[id]` and `/notifications`.

### `notificationStore.js`
- Persist/shares notification history across app via localStorage.
- Provides APIs to look up notifications by category or scheme.
- Used by `/notifications`, `/schemes`, and `/schemes/[id]`.

### `applicationTracker.js`
- Simulates citizen application behavior for a scheme.
- Generates a mock dataset of applications and computes adoption analytics.
- Used in `/schemes/[id]` application tab.

---

## 🧭 Key UI Components (`src/components`)

- `BackButton.js` – universal back navigation control.
- `BoothIndicator.js` – top bar booth selector + quick switcher (reads `localStorage`).
- `ProgressBar.js` – stepbar across the flow (Booth → Data → AI → Dashboard → Notify).
- `CategoryChart.js` – pie chart for category distribution (Chart.js).
- `AgeChart.js` – bar chart for age groups (Chart.js).

---

## 🚀 Backend Integration Checklist (For Backend Engineer)

✅ **Must provide**
- A real endpoint for voter data (replacing `/api/voters`).
- Booth list & metadata (for map + booth selector) – ideally `GET /api/booths`.
- Ability to query voters by booth (`GET /api/voters?boothId=`).
- Scheme catalog API (`GET /api/schemes`, `GET /api/schemes/:id`).
- Persisted notifications and campaign history (replacing localStorage persistence).

✅ **Nice-to-have**
- Authentication / authorization (currently none).
- Real delivery channel integration (SMS / voice service) instead of simulated logs.
- Real application tracking feed / updates from government portals.
- WebSocket or polling endpoint to update campaign status in realtime.

---

## 🧩 Recommended Backend API Design (Example Contract)

### Booths
- `GET /api/booths`
  ```json
  [
    { "id": "B101", "name": "Booth 101", "area": "Ward 5 — Laxmi Nagar", "district": "East Delhi", "type": "Urban", "lat": 28.6312, "lng": 77.2772, "voters": 1240 }
  ]
  ```

### Voters
- `GET /api/voters?boothId=B101`
  ```json
  {
    "booth": "B101",
    "totalVoters": 1240,
    "voters": [ { "name": "...", "age": 48, "occupation": "Farmer" } ]
  }
  ```

### Schemes
- `GET /api/schemes`
- `GET /api/schemes/:id`

### Notifications / Campaigns
- `POST /api/notifications` (payload: category / schemeId / type / targetIds)
- `GET /api/notifications?category=Farmers`
- `GET /api/campaigns?schemeId=SCH001`

---

## ⚙️ Notes for Backend Implementation

- The frontend uses **localStorage for persistence**, so the backend should ideally keep the same shape of data (or translate it) when responding.
- All pages are **client components** (`"use client"`) and expect **async APIs** to return quickly.
- `BoothIndicator` reads `localStorage.boothId`; it uses that to keep the selected booth in sync across pages.
- Most UI logic is **deterministic**, but several pages intentionally produce random/animated results for UX (campaign delivery simulation, application adoption). Real backend data will replace those.

---

## ✅ Quick Win Roadmap (Backend Priorities)

1. **Implement `/api/voters?boothId=`** returning real voters, then update `/app/fetch-data/page.js` to pass boothId query.
2. **Expose booth list + location data** to replace hardcoded `BOOTHS` array.
3. **Expose scheme catalog** and let frontend fetch it (instead of `SCHEMES_DATABASE`).
4. **Replace notification localStorage store** with a proper API and DB.
5. **Add campaign persistence + delivery status endpoints** for richer analytics.

---

## 📌 Where to Start in the Codebase (Entry Points)

- **UI flow start:** `src/app/page.tsx` → redirects to `/booth-selection`
- **API stub:** `src/app/api/voters/route.js`
- **Shared logic:** `src/lib/*` (segmentation, schemes, notifications)
- **Global UI + styling:** `src/app/layout.tsx` + `src/app/globals.css`

---

If you need a **backend data schema** (SQL/NoSQL) or **example request/response payloads** for a specific endpoint, tell me which page or feature you want to wire up first and I’ll provide the exact contract.
