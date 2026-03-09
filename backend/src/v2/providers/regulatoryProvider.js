const {
  boundsFromPolygon,
  polygonFromCenter,
  boundsFromFeature,
  intersectsBounds,
  pointInBounds,
  polygonIntersectsGeometry,
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
  const fromGeorefList = (items) => {
    if (!Array.isArray(items)) {
      return null;
    }
    const features = items
      .map((item) => {
        const center = item?.centroide;
        const lat = Number(center?.lat);
        const lng = Number(center?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }
        return {
          type: "Feature",
          properties: {
            name: item?.nombre || item?.nombre_completo || item?.id || "Georef item",
            source: "API Georef",
          },
          geometry: {
            type: "Point",
            coordinates: [lng, lat],
          },
        };
      })
      .filter(Boolean);
    return { type: "FeatureCollection", features };
  };

  if (!payload) {
    return { type: "FeatureCollection", features: [] };
  }
  if (payload.type === "FeatureCollection" && Array.isArray(payload.features)) {
    return payload;
  }
  if (Array.isArray(payload.features)) {
    return { type: "FeatureCollection", features: payload.features };
  }
  if (Array.isArray(payload.provincias)) {
    return fromGeorefList(payload.provincias);
  }
  if (Array.isArray(payload.departamentos)) {
    return fromGeorefList(payload.departamentos);
  }
  if (Array.isArray(payload.municipios)) {
    return fromGeorefList(payload.municipios);
  }
  if (Array.isArray(payload)) {
    return { type: "FeatureCollection", features: payload };
  }
  return { type: "FeatureCollection", features: [] };
};

const safeParseJson = (rawText) => {
  try {
    return JSON.parse(rawText);
  } catch (_error) {
    return null;
  }
};

const extractServiceException = (rawText) => {
  const serviceExceptionMatch = rawText.match(/<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/i);
  if (serviceExceptionMatch?.[1]) {
    return serviceExceptionMatch[1].replace(/\s+/g, " ").trim();
  }

  const exceptionTextMatch = rawText.match(/<ExceptionText[^>]*>([\s\S]*?)<\/ExceptionText>/i);
  if (exceptionTextMatch?.[1]) {
    return exceptionTextMatch[1].replace(/\s+/g, " ").trim();
  }

  return "";
};

const parseGeoPayload = async (response) => {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const rawText = await response.text();
  const parsed = safeParseJson(rawText);

  if (parsed) {
    return { data: ensureFeatureCollection(parsed), rawText };
  }

  const startsWithXml = rawText.trim().startsWith("<");
  const bodyPreview = rawText.trim().slice(0, 180).replace(/\s+/g, " ");
  const serviceException = extractServiceException(rawText);
  if (startsWithXml || contentType.includes("xml") || contentType.includes("html")) {
    return {
      error: `Respuesta no JSON (${contentType || "xml/html"}). ${serviceException ? `Detalle: ${serviceException}. ` : ""}Preview: ${bodyPreview}`,
      nonJsonResponse: true,
      rawText,
    };
  }

  return { error: `Respuesta inválida/no JSON. Preview: ${bodyPreview}`, rawText };
};

const parseWfsFeatureTypeNames = (xmlText) => {
  if (!xmlText || typeof xmlText !== "string") {
    return [];
  }
  const names = new Set();
  const regex = /<(?:[\w-]+:)?Name>\s*([^<]+)\s*<\/(?:[\w-]+:)?Name>/gi;
  let match = regex.exec(xmlText);
  while (match) {
    const value = String(match[1] || "").trim();
    if (value && value.includes(":")) {
      names.add(value);
    }
    match = regex.exec(xmlText);
  }
  return Array.from(names);
};

const preferredTypeNames = (source = {}) =>
  []
    .concat(Array.isArray(source.typeNames) ? source.typeNames : [])
    .concat(Array.isArray(source.typeNameHints) ? source.typeNameHints : [])
    .concat(source.typeName ? [source.typeName] : [])
    .filter(Boolean)
    .map((value) => String(value).trim());

const chooseTypeNames = ({ source, availableTypeNames = [] }) => {
  const preferred = preferredTypeNames(source);
  const selected = [];
  const pushUnique = (value) => {
    if (!value) {
      return;
    }
    if (!selected.some((item) => item.toLowerCase() === value.toLowerCase())) {
      selected.push(value);
    }
  };

  preferred.forEach((value) => {
    const exact = availableTypeNames.find((item) => item.toLowerCase() === value.toLowerCase());
    if (exact) {
      pushUnique(exact);
    }
  });

  preferred.forEach((value) => {
    const hint = value.toLowerCase();
    availableTypeNames
      .filter((item) => item.toLowerCase().includes(hint))
      .slice(0, 8)
      .forEach(pushUnique);
  });

  const sourceKeywords = []
    .concat(source?.type || "")
    .concat(source?.name || "")
    .concat(source?.id || "")
    .join(" ")
    .toLowerCase();

  const hydricKeywords = ["agua", "hidro", "hídr", "arroyo", "rio", "río", "wetland", "humedal"];
  const protectedKeywords = ["proteg", "parque", "reserva", "bosque"];

  if (hydricKeywords.some((keyword) => sourceKeywords.includes(keyword))) {
    availableTypeNames
      .filter((item) => /agua|hidro|h[ií]dr|arroyo|rio|r[ií]o|wetland|humedal/i.test(item))
      .slice(0, 10)
      .forEach(pushUnique);
  }

  if (protectedKeywords.some((keyword) => sourceKeywords.includes(keyword))) {
    availableTypeNames
      .filter((item) => /proteg|parque|reserva|bosque/i.test(item))
      .slice(0, 10)
      .forEach(pushUnique);
  }

  availableTypeNames.slice(0, 6).forEach(pushUnique);
  if (!selected.length) {
    preferred.forEach(pushUnique);
  }
  return selected;
};

const chooseTypeName = ({ source, availableTypeNames = [] }) => {
  const list = chooseTypeNames({ source, availableTypeNames });
  return list[0] || "";
};

const fetchText = async (url, source) => {
  const response = await withTimeout(
    (signal) =>
      fetch(url, {
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
  const text = await response.text();
  return { text };
};

const buildBbox = (projectBounds, bboxFormat) => {
  const bboxRaw = `${projectBounds.minLng},${projectBounds.minLat},${projectBounds.maxLng},${projectBounds.maxLat}`;
  if (bboxFormat === "wfs_crs") {
    return `${bboxRaw},EPSG:4326`;
  }
  return bboxRaw;
};

const loadWfsService = async (source, projectBounds) => {
  if (!source.url) {
    return { error: "URL WFS no configurada." };
  }

  const baseUrl = source.url;
  const capabilitiesUrl = source.capabilitiesUrl || `${baseUrl}?service=WFS&request=GetCapabilities`;
  const capabilitiesResponse = await fetchText(capabilitiesUrl, source);
  const availableTypeNames = capabilitiesResponse.error ? [] : parseWfsFeatureTypeNames(capabilitiesResponse.text);
  const candidateTypeNames = chooseTypeNames({ source, availableTypeNames }).slice(0, 12);
  if (!candidateTypeNames.length) {
    const preferred = preferredTypeNames(source);
    if (!preferred.length) {
      return {
        error: capabilitiesResponse.error
          ? `Capabilities WFS falló: ${capabilitiesResponse.error}`
          : "No se encontró typeName válido en capabilities WFS.",
      };
    }
    candidateTypeNames.push(...preferred.slice(0, 8));
  }

  const tryQuery = async ({ typeName, version = "2.0.0", outputFormat = "application/json", withBbox = true }) => {
    const url = new URL(baseUrl);
    url.searchParams.set("service", "WFS");
    url.searchParams.set("version", version);
    url.searchParams.set("request", "GetFeature");
    url.searchParams.set(version.startsWith("2") ? "typeNames" : "typeName", typeName);
    url.searchParams.set("outputFormat", outputFormat);
    url.searchParams.set("srsName", "EPSG:4326");

    if (withBbox && projectBounds) {
      url.searchParams.set("bbox", buildBbox(projectBounds, source.bboxFormat));
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

    return parseGeoPayload(response);
  };

  const attempts = [
    { version: source.wfsVersion || "2.0.0", outputFormat: "application/json", withBbox: true },
    { version: source.wfsVersion || "2.0.0", outputFormat: "json", withBbox: true },
    { version: source.wfsVersion || "2.0.0", outputFormat: "application/json", withBbox: false },
    { version: "1.0.0", outputFormat: "application/json", withBbox: true },
    { version: "1.0.0", outputFormat: "application/json", withBbox: false },
  ];

  let lastError = "Sin respuesta WFS.";
  for (const typeName of candidateTypeNames) {
    for (const attempt of attempts) {
      // eslint-disable-next-line no-await-in-loop
      const result = await tryQuery({ ...attempt, typeName });
      if (!result.error) {
        return {
          data: result.data,
          metadata: {
            selectedTypeName: typeName,
            attempted: attempts.length,
            availableTypeNamesCount: availableTypeNames.length,
            capabilitiesReachable: !capabilitiesResponse.error,
          },
        };
      }
      lastError = result.error;
    }
  }

  return {
    error: `WFS query falló (${candidateTypeNames.slice(0, 3).join(", ")}). ${lastError}`,
  };
};

const loadGeoJsonUrl = async (source, projectBounds) => {
  if (!source.url) {
    return { error: "URL no configurada para la fuente." };
  }

  const executeRequest = async ({ withBbox }) => {
    const url = new URL(source.url);
    if (withBbox && source.bboxQueryParam && projectBounds) {
      url.searchParams.set(source.bboxQueryParam, buildBbox(projectBounds, source.bboxFormat));
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

    return parseGeoPayload(response);
  };

  const withBbox = Boolean(source.bboxQueryParam && projectBounds);
  const firstAttempt = await executeRequest({ withBbox });
  if (!firstAttempt.error) {
    return firstAttempt;
  }

  const canRetryWithoutBbox = withBbox && source.retryWithoutBbox !== false;
  if (canRetryWithoutBbox && firstAttempt.nonJsonResponse) {
    const retry = await executeRequest({ withBbox: false });
    if (!retry.error) {
      return retry;
    }
    return { error: `${firstAttempt.error} | Retry sin bbox: ${retry.error}` };
  }

  return firstAttempt;
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
    url.searchParams.set(
      "geometry",
      `${projectBounds.minLng},${projectBounds.minLat},${projectBounds.maxLng},${projectBounds.maxLat}`
    );
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

  return parseGeoPayload(response);
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
  if (source.kind === "wfs_service") {
    return loadWfsService(source, projectBounds);
  }
  return loadGeoJsonUrl(source, projectBounds);
};

const featureName = (feature, fallback) => {
  const properties = feature?.properties || {};
  return (
    properties.name
    || properties.NAME
    || properties.title
    || properties.TITLE
    || properties.denominacion
    || fallback
  );
};

const geometryIntersectsProject = ({ feature, source, projectBounds, projectBoundary, coordinates }) => {
  const geometry = feature?.geometry || feature;
  if (!geometry) {
    return false;
  }

  if (projectBoundary && (geometry.type === "Polygon" || geometry.type === "MultiPolygon")) {
    return polygonIntersectsGeometry(projectBoundary, geometry);
  }

  const featureBounds = boundsFromFeature(feature);
  if (!featureBounds) {
    return false;
  }

  const intersects = projectBounds ? intersectsBounds(projectBounds, featureBounds) : false;
  const contains = !projectBounds && coordinates ? pointInBounds(coordinates, featureBounds) : false;
  return intersects || contains;
};

const evaluateMatches = ({
  source,
  featureCollection,
  projectBounds,
  projectBoundary,
  coordinates,
}) => {
  const overlaps = [];
  const features = Array.isArray(featureCollection?.features) ? featureCollection.features : [];
  features.forEach((feature, index) => {
    if (!geometryIntersectsProject({ feature, source, projectBounds, projectBoundary, coordinates })) {
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
      confidence: source.kind === "reference" ? "Media" : "Alta",
      severity: /humedal|wetland|agua|hídr|hidro|arroyo|proteg/i.test(source.type) ? "Alta" : "Media",
      properties: feature?.properties || {},
    });
  });
  return overlaps;
};

const summarizeCoverage = ({ sourceResults, minHealthySources, strictCritical }) => {
  const georeferenced = sourceResults.filter((item) => !item.referenceOnly);
  const textual = sourceResults.filter((item) => item.referenceOnly);
  const critical = georeferenced.filter((item) => item.source.critical);
  const healthy = georeferenced.filter((item) => item.status === "ok");
  const healthyCritical = critical.filter((item) => item.status === "ok");
  const degraded = georeferenced.filter((item) => item.status === "partial");
  const errored = georeferenced.filter((item) => item.status === "error");

  const criticalRequired = critical.length;
  const requiresCriticalGate = strictCritical && criticalRequired > 0;
  const healthyRequired = requiresCriticalGate ? healthyCritical.length : healthy.length;
  const requiredThreshold = requiresCriticalGate ? criticalRequired : minHealthySources;

  const missingCritical = critical
    .filter((item) => item.status !== "ok")
    .map((item) => item.source.name);

  const textualAvailable = textual.filter((item) => item.status === "ok").length;
  const configuredGeo = georeferenced.filter((item) => item.configured).length;
  const crossStatus = healthy.length > 0 ? (healthyRequired >= requiredThreshold ? "Sí" : "Parcial") : "No";

  return {
    minHealthySources,
    strictCritical: Boolean(strictCritical),
    georeferencedSources: georeferenced.length,
    georeferencedConfigured: configuredGeo,
    textualSources: textual.length,
    textualAvailable,
    criticalRequired,
    criticalHealthy: healthyCritical.length,
    healthySources: healthy.length,
    degradedSources: degraded.length,
    erroredSources: errored.length,
    requiredThreshold,
    gateMode: requiresCriticalGate ? "critical" : "minimum_healthy",
    isSufficient: healthyRequired >= requiredThreshold,
    missingCritical,
    crossStatus,
  };
};

const normalizeStatus = (loaded) => {
  if (loaded.error) {
    return "error";
  }
  if (loaded.warning) {
    return "partial";
  }
  return "ok";
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
        strictCritical: Boolean(config.strictCritical),
        georeferencedSources: 0,
        georeferencedConfigured: 0,
        textualSources: 0,
        textualAvailable: 0,
        criticalRequired: 0,
        criticalHealthy: 0,
        healthySources: 0,
        degradedSources: 0,
        erroredSources: 0,
        requiredThreshold: config.minHealthySources,
        gateMode: config.strictCritical ? "critical" : "minimum_healthy",
        isSufficient: false,
        missingCritical: [],
        crossStatus: "No",
      },
      warnings: ["Sin geometría de proyecto para consulta regulatoria."],
    };
  }

  const sourceResults = await Promise.all(
    registry.map(async (source) => {
      const configured = source.kind === "reference"
        ? Boolean(source.citationUrl || source.legalRef)
        : Boolean(source.url || source.data);

      let loaded = null;
      try {
        loaded = await loadFromSource(source, derivedBounds, coordinates);
      } catch (error) {
        loaded = {
          error: error?.message || "Error no controlado al consultar fuente regulatoria.",
        };
      }

      if (loaded.error) {
        return {
          source,
          configured,
          status: "error",
          error: loaded.error,
          featureCount: 0,
          matchedCount: 0,
          overlaps: [],
          referenceOnly: false,
          metadata: null,
        };
      }

      const overlaps = evaluateMatches({
        source,
        featureCollection: loaded.data,
        projectBounds: derivedBounds,
        projectBoundary: boundary,
        coordinates,
      });

      return {
        source,
        configured,
        status: normalizeStatus(loaded),
        error: loaded.warning || "",
        featureCount: Array.isArray(loaded.data?.features) ? loaded.data.features.length : 0,
        matchedCount: overlaps.length,
        overlaps,
        referenceOnly: Boolean(loaded.referenceOnly),
        metadata: loaded.metadata || null,
      };
    })
  );

  const overlaps = sourceResults.flatMap((item) => item.overlaps);
  const regulatoryRefs = sourceResults
    .filter((item) => item.status !== "error")
    .map((item) => `${item.source.authority} · ${item.source.legalRef || item.source.name}`);

  const coverage = summarizeCoverage({
    sourceResults,
    minHealthySources: config.minHealthySources,
    strictCritical: config.strictCritical,
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
      configured: item.configured,
      status: item.status,
      featureCount: item.featureCount,
      matchedCount: item.matchedCount,
      error: item.error || "",
      citationUrl: item.source.citationUrl || item.source.url || "",
      legalRef: item.source.legalRef || "",
      referenceOnly: item.referenceOnly || false,
      metadata: item.metadata || null,
      kind: item.source.kind,
    })),
    coverage,
    warnings: sourceResults
      .filter((item) => item.status === "error")
      .map((item) => `${item.source.name}: ${item.error}`),
  };
};

module.exports = {
  getRegulatorySignals,
  parseWfsFeatureTypeNames,
  chooseTypeName,
  chooseTypeNames,
};
