# Backend API

Node/Express backend for the Forensic Environmental Auditor demo.

## Setup

1. `cp .env.example .env` and edit as needed.
2. `npm install`
3. `npm run dev`

Server defaults to `http://localhost:5050`.

## Endpoints

- `GET /api/health`
- `POST /api/projects` (multipart/form-data)
  - Fields: `name`, `industry`, `scenario`, `lat`, `lng`, `claims`, `specs`, `caseId`, `boundary` (GeoJSON string)
  - File: `file` (PDF/TXT)
- `GET /api/projects`
- `GET /api/projects/:id`
- `POST /api/audits`
  - Body: `{ projectId, caseId, boundary }` or `{ projectName, claims, specs, lat, lng, caseId, boundary }`
- `GET /api/audits/:id`
- `GET /api/audits/:id/stream` (Server-Sent Events)

## Notes

- Regulatory RAG and geospatial checks are simulated; replace `auditEngine.js` with real vector DB + GIS integrations.
- Optional OpenAI step: set `OPENAI_API_KEY` to enable GPT-backed regulatory insights.
- You can override the model with `OPENAI_MODEL` and tweak reasoning with `OPENAI_REASONING_EFFORT`.
- EIA extraction: set `EIA_EXTRACT_MODE=auto` (default) to parse the PDF into structured facts.
- Optional environment signals: set `GOOGLE_ENV_API_KEY` to enable Air Quality + Weather context.
- Optional satellite pack: `SATELLITE_MODE=demo` (default) or `disabled`.
- Optional territorial signals (OSM/Overpass): `OVERPASS_ENDPOINT`, `OVERPASS_RADIUS_M`, `OVERPASS_TIMEOUT_MS`.
- Optional Planet Data API: `PLANET_API_KEY`, `PLANET_ITEM_TYPES`, `PLANET_LOOKBACK_DAYS`, `PLANET_MAX_CLOUD`.
- Planet Stats API: `PLANET_STATS_INTERVAL` (month/week/day) and optional `PLANET_STATS_UTC_OFFSET`.
- Optional Planet Processing (Stats): requires OAuth client ID/secret and a stats endpoint.
  - `PLANET_OAUTH_CLIENT_ID`, `PLANET_OAUTH_CLIENT_SECRET`
  - `PLANET_OAUTH_TOKEN_URL` (default: Sentinel Hub OAuth)
  - `PLANET_SH_STATS_URL` (default: Sentinel Hub Statistics API)
  - `PLANET_SH_COLLECTION_ID` (BYOC collection, optional)
  - `PLANET_SH_DATA_TYPE` (e.g. `byoc` when using BYOC)
  - `PLANET_SH_TIME_RANGE_DAYS`, `PLANET_SH_RES`, `PLANET_SH_MAX_CLOUD`
- Data is stored locally in `backend/data/db.json`.
