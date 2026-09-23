# ⚡ Real-Time Google Sheets ↔ Web Synchronization App

A production-ready single-page web application demonstrating reliable, real-time two-way synchronization between a React web interface and a Google Sheet. Changes made through the web application or directly inside the Google Sheet are synchronized automatically across both ends without requiring manual page refreshes.

---

## 💡 Why We Selected This Synchronization Approach

We chose a **Hybrid Architecture** combining **Google Apps Script Webhooks** with a **Python Background Fallback Poller** and **Node.js WebSockets (Socket.io)** for the following technical reasons:

1. **Sub-Second Real-Time Speed (< 1s)**:
   Google Apps Script container-bound `onChange` / `onEdit` triggers fire an instant HTTP POST webhook directly to our Node.js gateway whenever a user edits a cell in Google Sheets. Node.js broadcasts the update instantly to all open React browser tabs via WebSockets.
2. **Zero Quota Exhaustion & Rate-Limit Protection**:
   Google Sheets API has strict rate limits (60 requests per minute per project). Relying solely on fast polling risks API 429 quota exhaustion. Event-driven webhooks consume **zero API quota while idle**.
3. **100% Data Integrity & Network Resilience**:
   In case of temporary web network glitches or dropped webhook packets, the Python service runs a lightweight, non-blocking background poller every 5 seconds. Using **MD5 data content hash comparison**, it detects any missed edits and synchronizes the frontend automatically.
4. **Zero-Reload User Experience**:
   Web-initiated edits write to Google Sheets via Python API v4, while Socket.io pushes state changes to React dynamically without full page reloads.

---

## 🛠️ Required Technology Stack

- **Frontend**: React (Vite Single Page App) + Socket.io Client + CSS Glassmorphic UI
- **Real-Time Gateway**: Node.js (Express + Socket.io Server)
- **Google Sheets Sync Engine**: Python (FastAPI + gspread / Google Sheets API v4)
- **Event Trigger**: Google Apps Script (`onChange` container-bound webhook trigger)
- **Data Source**: Google Sheets API v4

---

## 📐 Architecture & How Synchronization Works

```
                       ┌─────────────────────────────────────────┐
                       │             React Frontend              │
                       │     (Single Page App - Table UI)        │
                       │           client/src/App.jsx            │
                       └──────────────────┬──────────────────────┘
                                          │
                    WebSocket (Socket.io) │ HTTP API Request (Edit Submit)
                 client/src/services/    │ client/src/App.jsx
                       socket.js          │
                                          ▼
                       ┌─────────────────────────────────────────┐
                       │       Node.js Real-Time Gateway         │
                       │         server-node/server.js           │
                       └─────────▲───────────────────┬───────────┘
                                 │                   │
              HTTP Webhook Push  │                   │ Internal HTTP API
          (Instant Sheet Edits)  │                   │ (Forward Edit)
                                 │                   ▼
                ┌────────────────┴───────┐ ┌─────────────────────────┐
                │   Google Apps Script   │ │   Python Sync Service   │
                │   apps-script/Code.gs  │ │   server-python/main.py │
                └────────────────▲───────┘ └─────────┬───────────────┘
                                 │                   │
                                 │ Sheet Edit        │ Google Sheets API v4
                                 └───────┬───────────┘ server-python/sheets_service.py
                                         ▼
                       ┌─────────────────────────────────────────┐
                       │              Google Sheet               │
                       │           (Columns A, B, C)             │
                       └─────────────────────────────────────────┘
```

### **1. Web → Google Sheet Workflow**
1. User clicks **Edit** on a row in React, updates Column A (`Name`), B (`Age`), or C (`City`), and clicks **Save & Sync**.
2. React sends `PUT /api/rows/:rowIndex` to the Node.js server.
3. Node.js routes the request to Python FastAPI backend (`PUT http://127.0.0.1:8000/api/rows/:rowIndex`).
4. Python executes the write operation to Google Sheets via Sheets API v4 (`gspread`) using Service Account credentials.
5. Node.js immediately broadcasts the updated dataset via Socket.io to all connected browsers.

### **2. Google Sheet → Web Workflow**
1. User or evaluator edits a cell directly in Google Sheets and presses `Enter`.
2. Apps Script trigger fires an HTTP POST webhook to `/api/sheet-webhook` on Node.js.
3. Node.js broadcasts a `sheet_updated` WebSocket event to all open React tabs.
4. React updates the UI state in **< 1 second** with a flash highlight.
5. In parallel, the Python background poller verifies hash integrity every 5s as a fallback.

---

## 🔑 Google Cloud Configuration Guide

### Step 1: Create GCP Project & Enable Google Sheets API
1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g. `google-sheets-sync-app`).
3. Navigate to **APIs & Services** $\rightarrow$ **Library**.
4. Search for **Google Sheets API** and click **Enable**.

### Step 2: Create Service Account & Credentials Key
1. Go to **APIs & Services** $\rightarrow$ **Credentials**.
2. Click **+ Create Credentials** $\rightarrow$ **Service Account**.
3. Name it (e.g. `sheets-sync-service`), assign the role **Editor**, and click **Done**.
4. Click on the created Service Account email $\rightarrow$ **Keys** tab $\rightarrow$ **Add Key** $\rightarrow$ **Create new key** (select **JSON**).
5. Download the JSON key file, rename it to `service_account.json`, and place it inside `server-python/service_account.json`.

### Step 3: Configure Google Sheet Permissions
1. Open your Google Sheet (with columns: `Name`, `Age`, `City`).
2. Click **Share** (top right) and add your Service Account email as **Editor**.
3. Set General Access to **"Anyone with the link can edit"** for easy evaluation.
4. Copy the **Spreadsheet ID** from the URL bar:
   `https://docs.google.com/spreadsheets/d/` **`YOUR_SPREADSHEET_ID_HERE`** `/edit`

### Step 4: Add Google Apps Script Trigger
1. In Google Sheets, click **Extensions** $\rightarrow$ **Apps Script**.
2. Copy code from `apps-script/Code.gs` and update `BACKEND_WEBHOOK_URL` with your backend URL.
3. Click **Triggers** (alarm clock icon) $\rightarrow$ **+ Add Trigger**:
   - Choose function: `onChange`
   - Event source: `From spreadsheet`
   - Event type: `On change`
4. Click **Save** and grant OAuth authorization permissions.

---

## ⚙️ Environment Variables (Dummy Templates)

### `server-node/.env.example`
```env
PORT=5000
PYTHON_SERVICE_URL=http://127.0.0.1:8000
```

### `server-python/.env.example`
```env
SPREADSHEET_ID=your_google_spreadsheet_id_here
SERVICE_ACCOUNT_FILE=service_account.json
NODE_SERVICE_URL=http://127.0.0.1:5000
POLL_INTERVAL_SECONDS=5
```

### `client/.env.example`
```env
VITE_SOCKET_URL=http://localhost:5000
```

---

## 🚀 Local Development Setup & Execution

### 1. Python Backend
```bash
cd server-python
python -m venv venv
# Activate virtualenv (Windows: venv\Scripts\activate | macOS/Linux: source venv/bin/activate)
pip install -r requirements.txt
python main.py
```
*(Runs on `http://127.0.0.1:8000`)*

### 2. Node.js Gateway
```bash
cd server-node
npm install
npm run dev
```
*(Runs on `http://localhost:5000`)*

### 3. React Frontend
```bash
cd client
npm install
npm run dev
```
*(Runs on `http://localhost:3000`)*

---

## 🌐 Free Hosting Deployment Guide

- **Frontend (React)**: Deployed on [Vercel](https://vercel.com) or [Netlify](https://netlify.com).
- **Backend Services**: Deployed on [Render.com](https://render.com) or [Railway.app](https://railway.app).
- **Uptime Keep-Alive**: Set up a free monitor on [UptimeRobot](https://uptimerobot.com) targeting `https://your-node-backend.onrender.com/api/health` to prevent free-tier cold starts.

---

## 🔒 Security Best Practices

- Secret credentials (`service_account.json` and `.env` files) are strictly listed in `.gitignore` to prevent leaks.
- Public template files (`.env.example`) are provided with dummy placeholder values.
