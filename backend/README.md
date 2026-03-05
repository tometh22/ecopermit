# Backend API

Node/Express backend for **Forensic Environmental Auditor v2**.

## Setup

1. `cp .env.example .env` and set env vars.
2. (Opcional recomendado) copia `backend/config/regulatory-sources.example.json` y reemplaza URLs por capas oficiales.
3. `npm install`
4. `npm run dev`

Server defaults to `http://localhost:5050`.

## v2 Endpoints

- `GET /api/v2/health`
- `GET /api/v2/regulatory/sources` (registry activo + thresholds)
- `POST /api/v2/cases` (multipart/form-data)
  - Fields: `name`, `projectType`, `mode`, `lat`, `lng`, `boundary` (GeoJSON string), `claims`, `specs`, `metadata`, `documentText`
  - File: `file` (PDF/TXT optional)
- `GET /api/v2/cases`
- `GET /api/v2/cases/:id`
- `POST /api/v2/cases/:id/runs`
  - Body supports overrides: `mode`, `claims`, `specs`, `lat`, `lng`, `boundary`, `documentText`
- `GET /api/v2/runs/:id`
- `GET /api/v2/runs/:id/stream` (SSE)
- `GET /api/v2/runs/:id/report?format=json|pdf`
- `POST /api/v2/cases/:id/monitoring`
  - Body: `enabled`, `frequency` (`hourly|daily|weekly`), `thresholdDeltaIcet`, `nextRunAt`
- `GET /api/v2/cases/:id/monitoring`

## Legacy v1 compatibility

Legacy endpoints remain for one transition version:

- `/api/projects`
- `/api/audits`

Responses include deprecation metadata (`LEGACY_API_DEPRECATION_DATE`).

## Persistence

- Default: JSON store in `backend/data/v2-db.json`
- Optional PostgreSQL: set `DATABASE_URL`
  - If `pg` is unavailable or connection fails, backend falls back to JSON store.

## Living EIA worker

Run scheduled monitoring worker:

```bash
npm run worker
```

Worker polls monitoring configs and creates periodic `LIVING_EIA` runs.

## Tests

```bash
npm test
```

Includes unit tests for scoring, inconsistency, and geometry utilities.

## Notes

- This is a due-diligence support engine and does **not** replace legal EIA filings.
- External providers (Google/Planet/OpenAI/Overpass) are optional; engine degrades gracefully when unavailable.
- Regulatory evidence gate: if critical georeferenced sources are not healthy, decision is set to `No concluyente` and score is considered provisional.
- Para activar fuentes regulatorias reales: define `REGULATORY_SOURCES_FILE=backend/config/regulatory-sources.json`.
