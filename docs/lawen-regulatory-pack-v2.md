# Lawen — Regulatory Pack v2

Este pack agrega a la base geoespacial nacional una capa normativa y administrativa más útil para análisis comercial y técnico en Mar del Plata.

## Archivo
- `/Users/tomi/Documents/New project/backend/config/regulatory-sources.ar.lawen.v2.json`

## Qué incorpora respecto a v1
- Base hídrica oficial (`IGN`) como fuentes críticas.
- Áreas protegidas (`APN`) como fuente geoespacial adicional.
- Georef administrativo específico para Buenos Aires y General Pueyrredón.
- Fuentes normativas textuales (`InfoLEG`, `Normas GBA`, `Boletín Oficial`, portal municipal) vía `kind: reference`.
- Entradas candidatas locales (`ADA`, `Ambiente PBA`) con `enabled: false` para activar cuando se valide endpoint/capa.

## Config en Render
Setear:

- `REGULATORY_SOURCES_FILE=backend/config/regulatory-sources.ar.lawen.v2.json`
- `REGULATORY_MIN_HEALTHY_SOURCES=2`
- `REGULATORY_USE_FALLBACK_CATALOG=false`
- `REGULATORY_ENABLE_DEMO_SOURCES=false`

Deploy backend.

## Verificación
1. `GET /api/v2/regulatory/sources`
   - Debe listar fuentes con `enabled=true/false`.
2. Ejecutar caso Lawen en `Pre-EIA` o `EIA QA`.
3. En tab `Trazabilidad`, validar:
   - `Regulatory Source Registry`
   - Cobertura de fuentes saludables
   - Warnings de fuentes no disponibles

## Cómo activar fuentes candidatas
1. Cambiar `enabled` a `true` en la fuente candidata.
2. Si es WFS, reemplazar `url` por endpoint GetFeature que devuelva GeoJSON.
3. Redeploy y revisar `/api/v2/regulatory/sources`.

## Regla operativa recomendada
- Mantener críticas solo en capas robustas (alta disponibilidad).
- Dejar capas locales nuevas como no críticas hasta 2 semanas de estabilidad.

