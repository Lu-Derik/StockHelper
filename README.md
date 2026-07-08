# StockHelper — A股AI研究助手

A local tool for asking AI questions about A-share stocks, capturing responses from DeepSeek via a Chrome extension, and storing them for browsing and review.

## Architecture

```
┌─────────────┐   HTTP/WS   ┌──────────────┐   WebSocket   ┌─────────────────┐
│  Next.js 15 │ ──────────► │  Koa Server  │ ◄──────────── │ Chrome Extension│
│  (port 3000)│             │  (port 3001) │               │  (DeepSeek tab) │
└─────────────┘             │  WS:3002     │               └─────────────────┘
                            └──────┬───────┘
                                   │
                            ┌──────▼───────┐
                            │  PostgreSQL  │
                            │  (port 5435) │
                            └──────────────┘
```

**Data flow:** User submits a question in the web app → Koa server saves it and notifies the Chrome extension via WebSocket → extension opens DeepSeek, types the question, waits for the response, and captures the HTML → server converts HTML to Markdown and stores both → web app displays the response in three formats.

## Prerequisites

- Node.js 20+
- Docker (for PostgreSQL)
- Google Chrome

## Setup

### 1. Install dependencies

```bash
# From the project root
npm install
cd apps/server && npm install
cd ../web && npm install
```

### 2. Start the database

```bash
# From project root
docker-compose up -d stockhelper-db
```

This starts a dedicated PostgreSQL 17 container on port **5435** with:
- Database: `stockhelper`
- User: `stockhelper`
- Password: `stockhelper2024`

### 3. Run database migrations

```bash
cd apps/server
npm run migrate
```

### 4. Start the backend server

```bash
cd apps/server
npm run dev
```

The Koa server starts on **http://localhost:3001** and the WebSocket server on **ws://localhost:3002**.

### 4.1 Re-deploy the backend server (local Docker)

If the backend code or Docker image changed, rebuild and restart the server container from the project root:

```bash
# From the project root
docker compose --env-file apps/server/.env up -d --build server
```

Verify the service is running:

```bash
docker compose ps
docker compose logs -f server
curl http://localhost:3011/health
```

If you changed the database schema, run the migration again:

```bash
cd apps/server
npm run migrate
```

If you want to rebuild both the database and the server containers together:

```bash
docker compose --env-file apps/server/.env up -d --build stockhelper-db server
```

### 5. Start the frontend

```bash
cd apps/web
npm run dev
```

The Next.js app starts on **http://localhost:3000**.

### 6. Load the browser extension

The extension is built on Chrome's Manifest V3 API. It works natively in all Chromium-based browsers and can be converted for Safari with moderate effort.

#### Google Chrome

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select `apps/extension/`

#### Microsoft Edge

1. Go to `edge://extensions`
2. Enable **Developer mode** (bottom-left toggle)
3. Click **Load unpacked** → select `apps/extension/`

#### Opera

1. Go to `opera://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select `apps/extension/`

#### Brave

1. Go to `brave://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select `apps/extension/`

#### Vivaldi

1. Go to `vivaldi://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select `apps/extension/`

#### Firefox ❌ Not supported

Firefox does not support `chrome.offscreen` (Offscreen Document API) or `chrome.storage.session`, both of which this extension depends on. Supporting Firefox would require a significant rewrite of the background polling logic.

#### Safari ⚠️ Requires conversion (medium effort)

Safari supports Manifest V3 extensions since Safari 15.4, but two APIs need to be replaced before conversion:

| Current API | Replacement |
|---|---|
| `chrome.offscreen` | `chrome.alarms` for periodic polling |
| `chrome.storage.session` | `chrome.storage.local` |

Once those are fixed (~1–2 days of work), Apple provides an automated converter:

```bash
# Requires Xcode on macOS
xcrun safari-web-extension-converter apps/extension/ --project-location ./safari-extension
```

This generates an Xcode project you can build and sideload on your Mac (no Apple Developer account needed for local use). Distributing via the App Store requires a paid Apple Developer account ($99/year).

---

The extension icon appears in the toolbar. Click it to check the connection status — it should show **"已连接到 StockHelper"** once the backend is running.

## Usage

### Ask a question

1. Open **http://localhost:3000**
2. Optionally enter a stock code (e.g. `600519`)
3. Type your question (e.g. `分析贵州茅台2024年的基本面`)
4. Click **发送给 DeepSeek**

The extension will open (or reuse) a DeepSeek tab, submit the question, wait for the full response, and send it back to the server automatically.

### View responses

Go to **记录** to see all past queries. Click any completed record to view the response in three formats:

| Tab | Description |
|-----|-------------|
| **美化视图** | Structured card layout, sections auto-detected from headings |
| **Markdown** | Rendered Markdown with syntax highlighting |
| **原始HTML** | Raw HTML captured from DeepSeek, with source/preview toggle |

### Manage stocks

Go to **股票** to add and browse tracked stocks (code, name, market SH/SZ).

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/queries` | Submit a new question |
| `GET` | `/api/queries` | List queries (`?stockCode=&status=&page=&pageSize=`) |
| `GET` | `/api/queries/:id/response` | Get response (`?format=html\|markdown`) |
| `POST` | `/api/stocks` | Add a stock |
| `GET` | `/api/stocks` | List all stocks |
| `GET` | `/health` | Health check |

## Project Structure

```
StockHelper/
├── docker-compose.yml
├── apps/
│   ├── server/                  # Koa + TypeScript backend
│   │   └── src/
│   │       ├── db/              # PostgreSQL pool and migrations
│   │       ├── routes/          # REST API routes
│   │       ├── services/        # HTML→Markdown conversion
│   │       ├── ws/              # WebSocket hub
│   │       └── index.ts
│   ├── web/                     # Next.js 15 frontend
│   │   ├── app/
│   │   │   ├── page.tsx         # Query submission
│   │   │   ├── records/         # Query history and detail
│   │   │   └── stocks/          # Stock management
│   │   └── components/
│   │       └── response/        # Three response view components
│   └── extension/               # Chrome extension (Manifest V3)
│       ├── manifest.json
│       ├── background.js        # WebSocket client + tab management
│       ├── content.js           # Page injection + response capture
│       └── popup.html           # Connection status popup
└── packages/
    └── shared/                  # Shared TypeScript types
```

## Notes

- **DeepSeek selectors:** The extension captures responses by watching for `.ds-markdown` elements. If DeepSeek updates their DOM, the selectors in `apps/extension/content.js` may need updating.
- **Login required:** The extension uses your existing Chrome session. Make sure you are logged in to DeepSeek before sending a query.
- **Response timeout:** If DeepSeek takes longer than 3 minutes, the extension captures whatever is on screen at that point.
