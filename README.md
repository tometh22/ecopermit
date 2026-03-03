# Forensic Environmental Auditor v2

Plataforma de due diligence ambiental con tres modos:

- `Pre‑EIA`: filtro temprano de riesgo territorial.
- `EIA QA`: auditoría de consistencia para EIA existente.
- `Living EIA`: monitoreo periódico con alertas por cambio.

> Nota legal: esta app complementa análisis técnico y no reemplaza el EIA oficial requerido por autoridad.

## Arquitectura

- Frontend estático: `index.html`, `styles.css`, `app.js`, `config.js`
- Backend API Node/Express: `backend/src`
- API v2: casos + runs + evidencia + export
- Compat legacy: `/api/projects` y `/api/audits` (deprecados)

## Ejecución local

### 1) Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Backend por defecto: `http://localhost:5050`

### 2) Frontend

Abre `index.html` directamente en el navegador.

Opcionalmente puedes pasar query params:

- `?api=https://tu-backend` para API base
- `?maps_key=TU_GOOGLE_MAPS_KEY` para mapa satelital

## Configuración de claves

### Frontend (`config.js`)

```js
window.APP_CONFIG = {
  GMAPS_API_KEY: "",
  API_BASE_URL: "https://tu-backend.onrender.com",
};
```

### Backend (`backend/.env`)

- OpenAI: `OPENAI_API_KEY`
- Google Air/Weather: `GOOGLE_ENV_API_KEY`
- Planet Data: `PLANET_API_KEY`
- Planet Processing: `PLANET_OAUTH_CLIENT_ID`, `PLANET_OAUTH_CLIENT_SECRET`

## API v2 principal

- `POST /api/v2/cases`
- `GET /api/v2/cases/:id`
- `POST /api/v2/cases/:id/runs`
- `GET /api/v2/runs/:id`
- `GET /api/v2/runs/:id/stream`
- `GET /api/v2/runs/:id/report?format=json|pdf`
- `POST /api/v2/cases/:id/monitoring`
- `GET /api/v2/cases/:id/monitoring`

## Worker Living EIA

```bash
cd backend
npm run worker
```

## Tests

```bash
cd backend
npm test
```
