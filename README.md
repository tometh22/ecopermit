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

## Optional: Google Maps

1. Add a Google Maps API key in `app.js` by setting `GMAPS_API_KEY`.
2. Reload the page to see the live map render in the Geospatial Core panel.

## Demo Logic

- Regulatory RAG: Simulated retrieval from `Global_Regulatory_Framework` with optional GPT enrichment.
- Consistency Auditor: Flags `CRITICAL_ALERT` when claims include `Neutral Impact` and specs include `Resource Extraction` or `Discharge`.
- Geospatial Verifier: Checks coordinates against simulated restricted zones (Wetlands, Native Forests, Fault Lines).

## Export

The **Generate Correction Roadmap** button opens a print-ready window. Use your browser print dialog to save as PDF.
