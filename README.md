# Forensic Environmental Auditor Demo

Static front-end demo for a three-column dashboard that highlights discrepancies between project claims and regulatory requirements.

## Run

Open `index.html` in a browser.

## Optional: Google Maps

1. Add a Google Maps API key in `app.js` by setting `GMAPS_API_KEY`.
2. Reload the page to see the live map render in the Geospatial Core panel.

## Demo Logic

- Regulatory RAG: Simulated retrieval from `Global_Regulatory_Framework` using a Gemini 1.5 Pro placeholder.
- Consistency Auditor: Flags `CRITICAL_ALERT` when claims include `Neutral Impact` and specs include `Resource Extraction` or `Discharge`.
- Geospatial Verifier: Checks coordinates against simulated restricted zones (Wetlands, Native Forests, Fault Lines).

## Export

The **Generate Correction Roadmap** button opens a print-ready window. Use your browser print dialog to save as PDF.
