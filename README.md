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
- Fuentes regulatorias georreferenciadas:
  - `REGULATORY_SOURCES_FILE` (ruta a JSON) o `REGULATORY_SOURCES_JSON`
  - `REGULATORY_MIN_HEALTHY_SOURCES` (mínimo para resultado concluyente)
  - `REGULATORY_STRICT_CRITICAL=true` para exigir fuentes críticas
  - `REGULATORY_USE_FALLBACK_CATALOG=false` recomendado para evitar catálogo demo
  - plantilla: `backend/config/regulatory-sources.example.json`
  - pack AR inicial: `backend/config/regulatory-sources.ar.initial.json`
  - pack Lawen v1: `backend/config/regulatory-sources.ar.lawen.v1.json`
  - pack Lawen v2: `backend/config/regulatory-sources.ar.lawen.v2.json`

## API v2 principal

- `POST /api/v2/cases`
- `GET /api/v2/cases/:id`
- `POST /api/v2/cases/:id/runs`
- `GET /api/v2/runs/:id`
- `GET /api/v2/runs/:id/stream`
- `GET /api/v2/runs/:id/report?format=json|pdf`
- `POST /api/v2/cases/:id/monitoring`
- `GET /api/v2/cases/:id/monitoring`
- `GET /api/v2/regulatory/sources`

## Lectura del resultado (clave comercial)

La salida ahora separa explícitamente:

- `Riesgo (ICET + decisión)`:
  - `Apto`
  - `Apto con mitigaciones menores`
  - `Apto con rediseño estructural`
  - `No recomendado`
- `Validez probatoria`:
  - `Concluyente` (cobertura regulatoria suficiente)
  - `Provisional` (faltan fuentes críticas o umbral regulatorio)

Esto evita mezclar “riesgo” con “calidad de evidencia”.

## Cruce normativo oficial

El backend publica:

- `executiveResult.regulatorySummary` (estado de cruce, fuentes saludables, críticas, gate y razones)
- `evidencePack.regulatorySources` (estado por fuente)
- `evidencePack.complianceMatrix` (matriz con `Base legal` por exigencia)

## Resumen IA integral

- `executiveResult.aiNarrative` agrega lectura ejecutiva del run completo (riesgo + normativa + contradicciones + plan).
- Si `OPENAI_API_KEY` está configurada, se genera con GPT.
- Si no, se usa fallback determinístico (sin invención de datos).

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

## Pack regulatorio Lawen v2

Archivo recomendado:

- `/Users/tomi/Documents/New project/backend/config/regulatory-sources.ar.lawen.v2.json`

Incluye:

- IGN WFS (hidrografía areal + lineal) con endpoint workspace correcto (`/geoserver/ign/ows`) y capas explícitas.
- Fallback de áreas protegidas vía IGN (`ign:area_protegida`).
- APN WFS desactivado por defecto (inestabilidad externa), listo para reactivar.
