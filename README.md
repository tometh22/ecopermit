# Forensic Environmental Auditor Demo

Front-end dashboard + backend API that highlight discrepancies between project claims and regulatory requirements.

## Run (Local)

1. Start the backend:
   ```bash
   cd backend
   cp .env.example .env
   npm install
   npm run dev
   ```
2. Open `index.html` in a browser.

By default the UI calls `http://localhost:5050`. To target a different API, open the UI with:

```
index.html?api=https://your-api.example.com
```

This saves the API base URL in `localStorage` for future sessions.

## Demo Cases

Load the Lawen demo dataset (based on press sources) with:

```
index.html?case=lawen
```

## Boundary Polygon (Exact)

Upload a `KML` or `GeoJSON` file in the **Datos del proyecto** section to draw the exact boundary polygon.

## Google Maps (Satellite)

Provide a Google Maps JavaScript API key at runtime:

```
index.html?maps_key=YOUR_GOOGLE_MAPS_KEY
```

The key is stored in `localStorage` for the browser session and enables the satellite basemap.

## Air Quality + Weather Context

To enable environmental context signals (AQI + weather), set this in the backend `.env` (or Render env vars):

```
GOOGLE_ENV_API_KEY=YOUR_GOOGLE_API_KEY
GOOGLE_ENV_CACHE_MS=600000
```

The key stays server-side. Only the frontend map uses the `maps_key` query param.

## Satellite Evidence (Demo)

Satellite evidence is currently simulated in demo mode. Configure with:

```
SATELLITE_MODE=demo
```

## Planet Data API (Opcional)

Configura la API key en el backend para obtener señales reales de escenas:

```
PLANET_API_KEY=YOUR_PLANET_API_KEY
PLANET_ITEM_TYPES=PSScene
PLANET_LOOKBACK_DAYS=365
PLANET_MAX_CLOUD=
PLANET_STATS_INTERVAL=month
PLANET_STATS_UTC_OFFSET=
```

## Planet Processing API (Stats) (Opcional)

Para obtener NDVI/NDWI desde Processing Stats, configura OAuth en el backend:

```
PLANET_OAUTH_CLIENT_ID=YOUR_CLIENT_ID
PLANET_OAUTH_CLIENT_SECRET=YOUR_CLIENT_SECRET
PLANET_OAUTH_TOKEN_URL=https://services.sentinel-hub.com/auth/realms/main/protocol/openid-connect/token
PLANET_SH_STATS_URL=https://services.sentinel-hub.com/api/v1/statistics
PLANET_SH_COLLECTION_ID=
PLANET_SH_DATA_TYPE=
PLANET_SH_TIME_RANGE_DAYS=90
PLANET_SH_RES=10
PLANET_SH_MAX_CLOUD=40
```

Si usas BYOC, establece `PLANET_SH_COLLECTION_ID` y `PLANET_SH_DATA_TYPE=byoc`.

## Demo Logic

- Regulatory RAG: Simulated retrieval from `Global_Regulatory_Framework` with optional GPT enrichment.
- Consistency Auditor: Flags `CRITICAL_ALERT` when claims include `Neutral Impact` and specs include `Resource Extraction` or `Discharge`.
- Geospatial Verifier: Checks coordinates against simulated restricted zones (Wetlands, Native Forests, Fault Lines).

## Export

The **Generate Correction Roadmap** button opens a print-ready window. Use your browser print dialog to save as PDF.
