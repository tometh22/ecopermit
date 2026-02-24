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
  - Fields: `name`, `industry`, `scenario`, `lat`, `lng`, `claims`, `specs`
  - File: `file` (PDF/TXT)
- `GET /api/projects`
- `GET /api/projects/:id`
- `POST /api/audits`
  - Body: `{ projectId }` or `{ projectName, claims, specs, lat, lng }`
- `GET /api/audits/:id`
- `GET /api/audits/:id/stream` (Server-Sent Events)

## Notes

- Regulatory RAG and geospatial checks are simulated; replace `auditEngine.js` with real vector DB + GIS integrations.
- Optional OpenAI step: set `OPENAI_API_KEY` to enable GPT-backed regulatory insights.
- You can override the model with `OPENAI_MODEL` and tweak reasoning with `OPENAI_REASONING_EFFORT`.
- Optional environment signals: set `GOOGLE_ENV_API_KEY` to enable Air Quality + Weather context.
- Data is stored locally in `backend/data/db.json`.
