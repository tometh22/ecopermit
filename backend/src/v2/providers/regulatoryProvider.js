const {
  boundsFromPolygon,
  polygonFromCenter,
  boundsFromFeature,
  intersectsBounds,
  pointInBounds,
} = require("../utils/geo");
const { getSourceRegistry, getRegistryConfig } = require("../regulatory/sourceRegistry");

const DEFAULT_TIMEOUT_MS = Number(process.env.REGULATORY_FETCH_TIMEOUT_MS || 12000);

const withTimeout = async (promiseFactory, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await promiseFactory(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
};

const ensureFeatureCollection = (payload) => {
  if (!payload) {
    return { type: "FeatureCollection", features: [] };
  }
  if (payload.type === "FeatureCollection" && Array.isArray(payload.features)) {
    return payload;
  }
  if (Array.isArray(payload.features)) {
    return { type: "FeatureCollection", features: payload.features };
  }
  if (Array.isArray(payload)) {
    return { type: "FeatureCollection", features: payload };
  }
  return { type: "FeatureCollection", features: [] };
};

const loadGeoJsonUrl = async (source, projectBounds) => {
  if (!source.url) {
    return { error: "URL no configurada para la fuente." };
  }

  const url = new URL(source.url);
  if (source.bboxQueryParam && projectBounds) {
    const bbox = `${projectBounds.minLng},${projectBounds.minLat},${projectBounds.maxLng},${projectBounds.maxLat}`;
    url.searchParams.set(source.bboxQueryParam, bbox);
  }

  const response = await withTimeout(
    (signal) =>
      fetch(url.toString(), {
        method: "GET",
        headers: source.headers || undefined,
        signal,
      }),
    source.timeoutMs || DEFAULT_TIMEOUT_MS
  );

  if (!response.ok) {
    const text = await response.text();
    return { error: `HTTP ${response.status}: ${text}` };
  }

  const payload = await response.json();
  return { data: ensureFeatureCollection(payload) };
};

const loadArcGis = async (source, projectBounds, coordinates) => {
  if (!source.url) {
    return { error: "URL ArcGIS no configurada." };
  }

  const url = new URL(`${source.url.replace(/\/$/, "")}/query`);
  url.searchParams.set("where", "1=1");
  url.searchParams.set("outFields", "*");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("f", "geojson");
  url.searchParams.set("outSR", "4326");

  if (projectBounds) {
    url.searchParams.set("geometry", `${projectBounds.minLng},${projectBounds.minLat},${projectBounds.maxLng},${projectBounds.maxLat}`);
    url.searchParams.set("geometryType", "esriGeometryEnvelope");
    url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
    url.searchParams.set("inSR", "4326");
  } else if (coordinates) {
    url.searchParams.set("geometry", `${coordinates.lng},${coordinates.lat}`);
    url.searchParams.set("geometryType", "esriGeometryPoint");
    url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
    url.searchParams.set("inSR", "4326");
  }

  const response = await withTimeout(
    (signal) =>
      fetch(url.toString(), {
        method: "GET",
        headers: source.headers || undefined,
        signal,
      }),
    source.timeoutMs || DEFAULT_TIMEOUT_MS
  );

  if (!response.ok) {
    const text = await response.text();
    return { error: `HTTP ${response.status}: ${text}` };
  }

  const payload = await response.json();
  return { data: ensureFeatureCollection(payload) };
};

const loadFromSource = async (source, projectBounds, coordinates) => {
  if (source.kind === "reference") {
    return {
      data: { type: "FeatureCollection", features: [] },
      referenceOnly: true,
    };
  }
  if (source.kind === "inline_geojson") {
    return { data: ensureFeatureCollection(source.data) };
  }
  if (source.kind === "arcgis_feature_service") {
    return loadArcGis(source, projectBounds, coordinates);
  }
  return loadGeoJsonUrl(source, projectBounds);
};

const featureName = (feature, fallback) => {
  const properties = feature?.properties || {};
  return (
    properties.name ||
    properties.NAME ||
    properties.title ||
    properties.TITLE ||
    properties.denominacion ||
    fallback
  );
};

const evaluateMatches = ({ source, featureCollection, projectBounds, coordinates }) => {
  const overlaps = [];
  const features = Array.isArray(featureCollection?.features) ? featureCollection.features : [];
  features.forEach((feature, index) => {
    const featureBounds = boundsFromFeature(feature);
    if (!featureBounds) {
      return;
    }

    const intersects = projectBounds ? intersectsBounds(projectBounds, featureBounds) : false;
    const contains = !projectBounds && coordinates ? pointInBounds(coordinates, featureBounds) : false;
    if (!intersects && !contains) {
      return;
    }

    overlaps.push({
      sourceId: source.id,
      sourceName: source.name,
      authority: source.authority,
      jurisdiction: source.jurisdiction,
      type: source.type,
      name: featureName(feature, `${source.name} #${index + 1}`),
      law: source.legalRef || source.name,
      citationUrl: source.citationUrl || source.url || "",
      confidence: "Alta",
      severity: /humedal|wetland|agua|hídr|hidro|arroyo|proteg/i.test(source.type) ? "Alta" : "Media",
      properties: feature?.properties || {},
    });
  });
  return overlaps;
};

const summarizeCoverage = ({ sourceResults, minHealthySources }) => {
  const critical = sourceResults.filter((item) => item.source.critical);
  const healthy = sourceResults.filter((item) => item.status === "ok");
  const healthyCritical = critical.filter((item) => item.status === "ok");

  const criticalRequired = critical.length;
  const healthyRequired = criticalRequired ? healthyCritical.length : healthy.length;
  const requiredThreshold = criticalRequired || minHealthySources;

  const missingCritical = critical
    .filter((item) => item.status !== "ok")
    .map((item) => item.source.name);

  return {
    minHealthySources: minHealthySources,
    criticalRequired,
    criticalHealthy: healthyCritical.length,
    healthySources: healthy.length,
    requiredThreshold,
    isSufficient: healthyRequired >= requiredThreshold,
    missingCritical,
  };
};

const getRegulatorySignals = async ({ coordinates, boundary }) => {
  const registry = getSourceRegistry();
  const config = getRegistryConfig();

  const derivedBounds = boundary ? boundsFromPolygon(boundary) : boundsFromPolygon(polygonFromCenter(coordinates, 1500));
  if (!coordinates && !derivedBounds) {
    return {
      overlaps: [],
      regulatoryRefs: [],
      sources: [],
      coverage: {
        minHealthySources: config.minHealthySources,
        criticalRequired: 0,
        criticalHealthy: 0,
        healthySources: 0,
        requiredThreshold: config.minHealthySources,
        isSufficient: false,
        missingCritical: [],
      },
      warnings: ["Sin geometría de proyecto para consulta regulatoria."],
    };
  }

  const sourceResults = await Promise.all(
    registry.map(async (source) => {
      const loaded = await loadFromSource(source, derivedBounds, coordinates);
      if (loaded.error) {
        return {
          source,
          status: "error",
          error: loaded.error,
          featureCount: 0,
          matchedCount: 0,
          overlaps: [],
          referenceOnly: false,
        };
      }

      const overlaps = evaluateMatches({
        source,
        featureCollection: loaded.data,
        projectBounds: derivedBounds,
        coordinates,
      });

      return {
        source,
        status: "ok",
        error: "",
        featureCount: Array.isArray(loaded.data?.features) ? loaded.data.features.length : 0,
        matchedCount: overlaps.length,
        overlaps,
        referenceOnly: Boolean(loaded.referenceOnly),
      };
    })
  );

  const overlaps = sourceResults.flatMap((item) => item.overlaps);
  const regulatoryRefs = sourceResults
    .filter((item) => item.status === "ok")
    .map((item) => `${item.source.authority} · ${item.source.legalRef || item.source.name}`);

  const coverage = summarizeCoverage({
    sourceResults,
    minHealthySources: config.minHealthySources,
  });

  return {
    overlaps,
    regulatoryRefs: Array.from(new Set(regulatoryRefs)),
    sources: sourceResults.map((item) => ({
      id: item.source.id,
      name: item.source.name,
      authority: item.source.authority,
      type: item.source.type,
      critical: item.source.critical,
      enabled: item.source.enabled,
      configured: item.source.kind === "reference"
        ? Boolean(item.source.citationUrl || item.source.legalRef)
        : Boolean(item.source.url || item.source.data),
      status: item.status,
      featureCount: item.featureCount,
      matchedCount: item.matchedCount,
      error: item.error || "",
      citationUrl: item.source.citationUrl || item.source.url || "",
      legalRef: item.source.legalRef || "",
      referenceOnly: item.referenceOnly || false,
    })),
    coverage,
    warnings: sourceResults
      .filter((item) => item.status !== "ok")
      .map((item) => `${item.source.name}: ${item.error}`),
  };
};

module.exports = {
  getRegulatorySignals,
};
