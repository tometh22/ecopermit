# Fuentes regulatorias iniciales (Argentina) — v0

Este inventario prioriza **fuentes oficiales** con posibilidad de uso geoespacial (WFS/WMS/GeoJSON/API) para `Pre-EIA`, `EIA QA` y `Living EIA`.

## 1) Núcleo nacional (recomendado para integración inmediata)

| Dominio | Fuente | Tipo | URL principal | URL técnica |
|---|---|---|---|---|
| Cartografía base oficial | IGN (Instituto Geográfico Nacional) | Portal + OGC | https://www.ign.gob.ar/NuestrasActividades/InformacionGeoespacial/CapasSIG | https://wms.ign.gob.ar/geoserver/ows?service=WFS&version=1.0.0&request=GetCapabilities |
| Áreas protegidas | APN (Administración de Parques Nacionales) | Portal + OGC | https://mapas.apn.gob.ar/ | https://mapas.apn.gob.ar/geoserver/ows?service=WFS&version=1.0.0&request=GetCapabilities |
| Biodiversidad / áreas protegidas | SIB/APN | Portal | https://sib.gob.ar | https://sib.gob.ar/portada (entrada institucional) |
| Referencia administrativa | API Georef (datos.gob.ar) | API REST/GeoJSON | https://www.datos.gob.ar/dataset/interior-normalizacion-datos-geograficos-codigos-postales-georef-argentina | https://apis.datos.gob.ar/georef/api/v2.0/provincias.geojson |
| Alertas hidrológicas | INA (Instituto Nacional del Agua) | API JSON | https://www.argentina.gob.ar/ina | https://alerta.ina.gob.ar/pub/datos/datos_5min.json |

## 2) Capa nacional/provincial extendida (validar por proyecto)

| Dominio | Fuente | Tipo | URL principal | URL técnica |
|---|---|---|---|---|
| Ordenamiento/territorio ambiental | OAT (Subsecretaría de Ambiente Nación) | GeoServer | https://oat.ambiente.gob.ar/geoserver/web/ | https://oat.ambiente.gob.ar/geoserver/ows?service=WFS&version=1.0.0&request=GetCapabilities |
| Infraestructura de datos BA | IDEBA (Provincia de Buenos Aires) | Catálogo geoservicios | https://www.gba.gob.ar/infraestructura_de_datos | https://www.gba.gob.ar/desarrollo_territorial_y_habitat/infraestructura_de_datos_espaciales |
| Geoservicios ambientales BA | Ministerio de Ambiente PBA | GeoServer | https://sig.ambiente.gba.gob.ar/geoserver | https://sig.ambiente.gba.gob.ar/geoserver/ows?service=WFS&version=1.0.0&request=GetCapabilities |
| Riesgo hídrico BA | ADA PBA | ArcGIS REST | https://www.gba.gob.ar/ada | https://arcgis.ada.gba.gov.ar/server/rest/services/riesgo_hidrico/MapServer |
| Geología / amenazas | SEGEMAR | WMS/WFS | https://www.argentina.gob.ar/produccion/segemar | https://ide.seg.gob.ar/geoserver/wms |
| EO nacional | CONAE (geo servicios) | WMTS/WMS/WFS | https://www.argentina.gob.ar/ciencia/conae | https://geoportal.conae.gov.ar/geoserver/wms |

## 3) Fuentes normativas (texto legal y vigencia)

| Tipo | Fuente | URL |
|---|---|---|
| Normativa nacional consolidada | InfoLEG | https://www.argentina.gob.ar/normativa |
| Boletín Oficial Nación | Boletín Oficial | https://www.boletinoficial.gob.ar |
| Normativa PBA | Normas Provincia de Buenos Aires | https://normas.gba.gob.ar |

## 4) Endpoints listos para `regulatory-sources.json` (arranque)

### 4.1 IGN — red hídrica (WFS GeoJSON)
- Hidrografía areal:
  - `https://wms.ign.gob.ar/geoserver/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ign:area_hidrografia_a&outputFormat=application/json&srsName=EPSG:4326`
- Hidrografía lineal:
  - `https://wms.ign.gob.ar/geoserver/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ign:linea_hidrografia_l&outputFormat=application/json&srsName=EPSG:4326`

### 4.2 APN — áreas protegidas (WFS GeoJSON)
- `https://mapas.apn.gob.ar/geoserver/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=public:apn&outputFormat=application/json&srsName=EPSG:4326`

### 4.3 Georef — recorte administrativo Buenos Aires (GeoJSON)
- Departamentos BA:
  - `https://apis.datos.gob.ar/georef/api/v2.0/departamentos.geojson?provincia=buenos%20aires`
- Municipios BA:
  - `https://apis.datos.gob.ar/georef/api/v2.0/municipios.geojson?provincia=buenos%20aires`

## 5) Criterio de priorización para producto
1. Integrar primero `IGN + APN + ADA/INA` (hidrología + protección + alerta).
2. Agregar `OAT + Ambiente PBA` para robustecer restricciones locales.
3. Mantener `InfoLEG + Boletines` como capa legal textual (citas y trazabilidad jurídica).

## 6) Notas de calidad de datos
- No todos los servicios exponen capas en GeoJSON directo; varios requieren selección de `typeName` WFS.
- Para producción, fijar control de versión por fuente: `last_checked_at`, `status`, `confidence`.
- Si una fuente crítica falla (timeout/5xx), marcar resultado como `No concluyente` (ya soportado en backend v2).

## 7) Packs ya creados en el repo
- Inicial AR: `/Users/tomi/Documents/New project/backend/config/regulatory-sources.ar.initial.json`
- Lawen v1: `/Users/tomi/Documents/New project/backend/config/regulatory-sources.ar.lawen.v1.json`
- Lawen v2: `/Users/tomi/Documents/New project/backend/config/regulatory-sources.ar.lawen.v2.json`
