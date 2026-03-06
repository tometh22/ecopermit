# Handoff — Forensic Environmental Auditor v2

## Estado actual
- Frontend y backend v2 integrados en flujo `Setup -> Resultado Ejecutivo -> Evidencia -> Exportar`.
- Gate regulatorio activo: si faltan fuentes críticas, el resultado queda `No concluyente`.
- Soporte de fuentes regulatorias por archivo JSON (`REGULATORY_SOURCES_FILE`).

## Archivos clave
- Frontend: `/Users/tomi/Documents/New project/index.html`, `/Users/tomi/Documents/New project/styles.css`, `/Users/tomi/Documents/New project/app.js`
- Backend API: `/Users/tomi/Documents/New project/backend/src/server.js`
- Orquestador v2: `/Users/tomi/Documents/New project/backend/src/v2/orchestrator/runOrchestrator.js`
- Fuentes regulatorias:
  - Ejemplo: `/Users/tomi/Documents/New project/backend/config/regulatory-sources.example.json`
  - Inicial AR: `/Users/tomi/Documents/New project/backend/config/regulatory-sources.ar.initial.json`
  - Lawen v1: `/Users/tomi/Documents/New project/backend/config/regulatory-sources.ar.lawen.v1.json`
  - Lawen v2: `/Users/tomi/Documents/New project/backend/config/regulatory-sources.ar.lawen.v2.json`
  - Research AR: `/Users/tomi/Documents/New project/docs/regulatory-sources-argentina.md`
  - Runbook Lawen: `/Users/tomi/Documents/New project/docs/lawen-regulatory-pack.md`
  - Runbook Lawen v2: `/Users/tomi/Documents/New project/docs/lawen-regulatory-pack-v2.md`

## Variables de entorno mínimas
- `OPENAI_API_KEY`
- `GOOGLE_MAPS_API_KEY` (front)
- `REGULATORY_SOURCES_FILE=backend/config/regulatory-sources.ar.initial.json` (o archivo propio)

Opcionales:
- `PLANET_API_KEY`
- `GOOGLE_AIR_QUALITY_API_KEY`
- `GOOGLE_WEATHER_API_KEY`

## Deploy actual
- Front: GitHub Pages
- Back: Render (`ecopermit-backend`)

## Siguiente paso recomendado
1. Validar capas AR iniciales en Render con `/api/v2/regulatory/sources`.
2. Reemplazar catálogo inicial por capas oficiales locales (Provincia/Municipio) para humedales y restricciones urbanas.
3. Cerrar pruebas E2E del caso Lawen en los 3 modos (`Pre-EIA`, `EIA QA`, `Living EIA`).
