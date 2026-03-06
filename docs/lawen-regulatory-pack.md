# Lawen — Regulatory Pack v1 (Argentina)

Este pack está preparado para usar en la app con foco en due diligence del caso Lawen (Mar del Plata).

## Objetivo
- Reducir resultados "inventados" usando fuentes oficiales georreferenciadas.
- Forzar `No concluyente` cuando fallan fuentes hídricas críticas.

## Archivo de catálogo
- `/Users/tomi/Documents/New project/backend/config/regulatory-sources.ar.lawen.v1.json`

## Configuración en Render (backend)
En `Environment` del servicio backend, setear:

- `REGULATORY_SOURCES_FILE=backend/config/regulatory-sources.ar.lawen.v1.json`
- `REGULATORY_MIN_HEALTHY_SOURCES=2`
- `REGULATORY_USE_FALLBACK_CATALOG=false`
- `REGULATORY_ENABLE_DEMO_SOURCES=false`

Luego `Manual Deploy -> Deploy latest commit`.

## Verificación rápida
1. Abrir: `https://ecopermit-backend.onrender.com/api/v2/regulatory/sources`
2. Esperado:
   - lista de 5 fuentes
   - al menos 2 críticas (`IGN hidrografía areal/lineal`)

## Lectura de estado durante corrida
- Si ambas fuentes críticas hídricas responden, el resultado puede ser **concluyente**.
- Si una o ambas fallan (timeout/5xx), la decisión final debe figurar como **No concluyente**.

## Fuentes incluidas
- IGN (hidrografía areal y lineal)
- APN (áreas protegidas)
- API Georef (provincias y departamentos BA)

## Límites actuales
- Este pack cubre bien la base nacional y referencia administrativa.
- Para máxima precisión local en Lawen, el siguiente paso es sumar capas oficiales municipales/provinciales específicas de:
  - humedales/zonas inundables locales,
  - restricciones de uso del suelo,
  - zonificación urbana vigente de General Pueyrredón.

