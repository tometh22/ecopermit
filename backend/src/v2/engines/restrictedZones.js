const { boundsFromPolygon } = require("../utils/geo");
const REGULATORY_USE_FALLBACK_CATALOG = String(process.env.REGULATORY_USE_FALLBACK_CATALOG || "").toLowerCase() === "true";

const RESTRICTED_ZONES = [
  {
    name: "Bosque Peralta Ramos",
    type: "Bosque protegido",
    bounds: { minLat: -38.105, maxLat: -38.065, minLng: -57.605, maxLng: -57.56 },
    law: "Ley 13.273 (referencia local)",
  },
  {
    name: "Arroyo Corrientes",
    type: "Curso de agua",
    bounds: { minLat: -38.1, maxLat: -38.07, minLng: -57.595, maxLng: -57.565 },
    law: "Franja de protección hídrica 15m",
  },
  {
    name: "Blue Delta Wetlands",
    type: "Wetlands",
    bounds: { minLat: 29.1, maxLat: 30.4, minLng: -91.2, maxLng: -90.1 },
    law: "Clean Water Act §404",
  },
  {
    name: "Sierra Native Forest Reserve",
    type: "Native Forests",
    bounds: { minLat: 36.3, maxLat: 37.2, minLng: -120.1, maxLng: -118.8 },
    law: "Forest Protection Act Art. 18",
  },
  {
    name: "Cascadia Fault Corridor",
    type: "Fault Lines",
    bounds: { minLat: 44.2, maxLat: 46.2, minLng: -124.6, maxLng: -122.7 },
    law: "Seismic Safety Code Art. 7",
  },
];

const intersects = (a, b) =>
  a.minLat <= b.maxLat &&
  a.maxLat >= b.minLat &&
  a.minLng <= b.maxLng &&
  a.maxLng >= b.minLng;

const containsPoint = (bounds, point) =>
  point.lat >= bounds.minLat
  && point.lat <= bounds.maxLat
  && point.lng >= bounds.minLng
  && point.lng <= bounds.maxLng;

const normalizeExternalOverlap = (item) => ({
  name: item.name || item.sourceName || "Zona regulatoria",
  type: item.type || "Restricción",
  law: item.law || item.legalRef || item.sourceName || "Fuente regulatoria",
  sourceId: item.sourceId || "",
  sourceName: item.sourceName || "",
  authority: item.authority || "",
  citationUrl: item.citationUrl || "",
  severity: item.severity || "Media",
});

const evaluateRestrictedZones = ({ coordinates, boundary, regulatorySignals }) => {
  const fromRegistry = Array.isArray(regulatorySignals?.overlaps)
    ? regulatorySignals.overlaps.map(normalizeExternalOverlap)
    : [];

  if (fromRegistry.length) {
    return fromRegistry;
  }

  if (!REGULATORY_USE_FALLBACK_CATALOG) {
    return [];
  }

  const polygonBounds = boundsFromPolygon(boundary);
  if (!polygonBounds && !coordinates) {
    return [];
  }

  return RESTRICTED_ZONES.filter((zone) => {
    if (polygonBounds && intersects(polygonBounds, zone.bounds)) {
      return true;
    }
    if (coordinates && containsPoint(zone.bounds, coordinates)) {
      return true;
    }
    return false;
  });
};

module.exports = {
  RESTRICTED_ZONES,
  evaluateRestrictedZones,
};
