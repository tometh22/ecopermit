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
- Optional environment signals: set `GOOGLE_ENV_API_KEY` to enable Air Quality + Weather context.
- Optional satellite pack: `SATELLITE_MODE=demo` (default) or `disabled`.
- Optional territorial signals (OSM/Overpass): `OVERPASS_ENDPOINT`, `OVERPASS_RADIUS_M`, `OVERPASS_TIMEOUT_MS`.
- Optional Planet Data API: `PLANET_API_KEY`, `PLANET_ITEM_TYPES`, `PLANET_LOOKBACK_DAYS`, `PLANET_MAX_CLOUD`.
- Data is stored locally in `backend/data/db.json`.
