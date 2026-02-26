const OVERPASS_ENDPOINT = process.env.OVERPASS_ENDPOINT || "https://overpass-api.de/api/interpreter";
const OVERPASS_RADIUS_M = Number(process.env.OVERPASS_RADIUS_M || 1500);
const OVERPASS_TIMEOUT_MS = Number(process.env.OVERPASS_TIMEOUT_MS || 12000);

const metersToLat = (meters) => meters / 111320;
const metersToLng = (meters, lat) => meters / (111320 * Math.cos((lat * Math.PI) / 180));

const boundsFromPolygon = (boundary) => {
  if (!boundary) {
    return null;
  }
  const ring = boundary.type === "Polygon"
    ? boundary.coordinates?.[0]
    : boundary.type === "MultiPolygon"
      ? boundary.coordinates?.[0]?.[0]
      : boundary.coordinates?.[0];
  if (!Array.isArray(ring)) {
    return null;
  }
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const coord of ring) {
    const [lng, lat] = coord;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue;
    }
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }
  if (!Number.isFinite(minLat)) {
    return null;
  }
  return { minLat, maxLat, minLng, maxLng };
};

const boundsFromCenter = (coords, radiusMeters) => {
  if (!coords) {
    return null;
  }
  const latDelta = metersToLat(radiusMeters);
  const lngDelta = metersToLng(radiusMeters, coords.lat);
  return {
    minLat: coords.lat - latDelta,
    maxLat: coords.lat + latDelta,
    minLng: coords.lng - lngDelta,
    maxLng: coords.lng + lngDelta,
  };
};

const buildOverpassQuery = (bbox) => {
  const bboxString = `${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`;
  return `[out:json][timeout:25];(
    way["waterway"](${bboxString});
    relation["waterway"](${bboxString});
    way["natural"="water"](${bboxString});
    relation["natural"="water"](${bboxString});
    way["natural"="wetland"](${bboxString});
    relation["natural"="wetland"](${bboxString});
    way["landuse"="forest"](${bboxString});
    relation["landuse"="forest"](${bboxString});
    relation["boundary"="protected_area"](${bboxString});
    relation["leisure"="nature_reserve"](${bboxString});
  );out tags center;`;
};

const fetchOverpass = async (query) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);

  try {
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: query,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Overpass error ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const summarizeOverpass = (payload) => {
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  let waterways = 0;
  let waters = 0;
  let wetlands = 0;
  let forests = 0;
  let protectedAreas = 0;

  for (const element of elements) {
    const tags = element.tags || {};
    if (tags.waterway) {
      waterways += 1;
    }
    if (tags.natural === "water") {
      waters += 1;
    }
    if (tags.natural === "wetland") {
      wetlands += 1;
    }
    if (tags.landuse === "forest") {
      forests += 1;
    }
    if (tags.boundary === "protected_area" || tags.leisure === "nature_reserve") {
      protectedAreas += 1;
    }
  }

  return { waterways, waters, wetlands, forests, protectedAreas };
};

const buildEvidence = (summary) => {
  const hasWater = summary.waterways + summary.waters > 0;
  const hasWetland = summary.wetlands > 0;
  const hasForest = summary.forests > 0;
  const protectedAreas = summary.protectedAreas;

  return {
    summary,
    evidence: {
      water: {
        value: hasWater ? "Presencia hídrica" : "Sin agua detectada",
        detail: hasWater
          ? `${summary.waterways + summary.waters} trazas hídricas (OSM)`
          : "Sin trazas registradas",
      },
      landCover: {
        value: hasForest ? "Cobertura forestal" : "Cobertura mixta",
        detail: hasForest ? `${summary.forests} polígonos bosque (OSM)` : "Sin polígonos forestales",
      },
      hydrology: {
        value: hasWetland ? "Humedal sensible" : "Sin humedal detectado",
        detail: hasWetland ? `${summary.wetlands} humedales (OSM)` : "Sin humedales registrados",
      },
      vegetation: {
        value: hasForest ? "Vegetación alta" : "Vegetación mixta",
        detail: hasForest ? "Bosque continuo detectado" : "Cobertura heterogénea",
      },
      source: "OpenStreetMap / Overpass (GIS abierto)",
    },
    regulatoryRefs: protectedAreas
      ? ["Área protegida detectada en OSM (verificar en fuentes oficiales)"]
      : [],
    alerts: [
      ...(hasWater
        ? [
            {
              type: "Hídrico",
              message: "Cuerpos de agua presentes en el área de análisis.",
              severity: "Alta",
            },
          ]
        : []),
      ...(hasWetland
        ? [
            {
              type: "Ambiental",
              message: "Humedal detectado en el área de análisis.",
              severity: "Alta",
            },
          ]
        : []),
      ...(protectedAreas
        ? [
            {
              type: "Regulatorio",
              message: "Área protegida registrada en datos abiertos.",
              severity: "Media",
            },
          ]
        : []),
    ],
  };
};

const fetchTerritorialSignals = async ({ coordinates, boundary }) => {
  const bounds = boundary ? boundsFromPolygon(boundary) : boundsFromCenter(coordinates, OVERPASS_RADIUS_M);
  if (!bounds) {
    return null;
  }

  try {
    const query = buildOverpassQuery(bounds);
    const payload = await fetchOverpass(query);
    const summary = summarizeOverpass(payload);
    return buildEvidence(summary);
  } catch (error) {
    return {
      evidence: null,
      regulatoryRefs: [],
      alerts: [],
      error: error.message || "Overpass error",
    };
  }
};

module.exports = {
  fetchTerritorialSignals,
};
