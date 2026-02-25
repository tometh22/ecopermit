const PLANET_OAUTH_CLIENT_ID = process.env.PLANET_OAUTH_CLIENT_ID || "";
const PLANET_OAUTH_CLIENT_SECRET = process.env.PLANET_OAUTH_CLIENT_SECRET || "";
const PLANET_OAUTH_TOKEN_URL =
  process.env.PLANET_OAUTH_TOKEN_URL ||
  "https://services.sentinel-hub.com/auth/realms/main/protocol/openid-connect/token";
const PLANET_SH_STATS_URL =
  process.env.PLANET_SH_STATS_URL || "https://services.sentinel-hub.com/api/v1/statistics";
const PLANET_SH_COLLECTION_ID = process.env.PLANET_SH_COLLECTION_ID || "";
const PLANET_SH_DATA_TYPE = process.env.PLANET_SH_DATA_TYPE
  || (PLANET_SH_COLLECTION_ID ? "byoc" : "sentinel-2-l2a");
const PLANET_SH_TIME_RANGE_DAYS = Number(process.env.PLANET_SH_TIME_RANGE_DAYS || 90);
const PLANET_SH_RES = Number(process.env.PLANET_SH_RES || 10);
const PLANET_SH_MAX_CLOUD = process.env.PLANET_SH_MAX_CLOUD
  ? Number(process.env.PLANET_SH_MAX_CLOUD)
  : null;
const PLANET_SH_TIMEOUT_MS = Number(process.env.PLANET_SH_TIMEOUT_MS || 12000);
const PLANET_SH_RADIUS_M = Number(process.env.PLANET_SH_RADIUS_M || 1500);

const metersToLat = (meters) => meters / 111320;
const metersToLng = (meters, lat) => meters / (111320 * Math.cos((lat * Math.PI) / 180));

const polygonFromCenter = (coords, radiusMeters) => {
  if (!coords) {
    return null;
  }
  const latDelta = metersToLat(radiusMeters);
  const lngDelta = metersToLng(radiusMeters, coords.lat);
  return {
    type: "Polygon",
    coordinates: [[
      [coords.lng - lngDelta, coords.lat + latDelta],
      [coords.lng + lngDelta, coords.lat + latDelta],
      [coords.lng + lngDelta, coords.lat - latDelta],
      [coords.lng - lngDelta, coords.lat - latDelta],
      [coords.lng - lngDelta, coords.lat + latDelta],
    ]],
  };
};

const DEFAULT_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "B03", "dataMask"] }],
    output: [
      { id: "default", bands: 2, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(sample) {
  var ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
  var ndwi = (sample.B03 - sample.B08) / (sample.B03 + sample.B08);
  return {
    default: [ndvi, ndwi],
    dataMask: [sample.dataMask]
  };
}`;

let tokenCache = {
  token: "",
  expiresAt: 0,
};

const hasProcessingCredentials = () => Boolean(PLANET_OAUTH_CLIENT_ID && PLANET_OAUTH_CLIENT_SECRET);

const fetchAccessToken = async () => {
  if (!hasProcessingCredentials()) {
    return null;
  }
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt - 60000 > now) {
    return tokenCache.token;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PLANET_SH_TIMEOUT_MS);
  try {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: PLANET_OAUTH_CLIENT_ID,
      client_secret: PLANET_OAUTH_CLIENT_SECRET,
    });

    const response = await fetch(PLANET_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OAuth error ${response.status}: ${errorText}`);
    }

    const payload = await response.json();
    const accessToken = payload.access_token;
    const expiresIn = Number(payload.expires_in || 0);
    if (!accessToken) {
      throw new Error("OAuth token missing in response.");
    }

    tokenCache = {
      token: accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    };

    return accessToken;
  } finally {
    clearTimeout(timeout);
  }
};

const extractMean = (stats) => {
  if (!stats) {
    return null;
  }
  const candidate = stats.mean ?? stats.avg ?? stats.average ?? stats.meanValue;
  if (Number.isFinite(candidate)) {
    return candidate;
  }
  if (candidate && typeof candidate === "object") {
    const nested = candidate.value ?? candidate.mean ?? candidate.avg;
    if (Number.isFinite(nested)) {
      return nested;
    }
  }
  return null;
};

const collectBandMeans = (data, bandIndex) => {
  const values = [];
  for (const item of data) {
    const bands = item?.outputs?.default?.bands;
    if (!bands) {
      continue;
    }
    const keys = Object.keys(bands);
    if (keys.length <= bandIndex) {
      continue;
    }
    const band = bands[keys[bandIndex]];
    const mean = extractMean(band?.stats || band?.statistics || band);
    if (Number.isFinite(mean)) {
      values.push(mean);
    }
  }
  if (!values.length) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const classifyNdvi = (ndvi) => {
  if (!Number.isFinite(ndvi)) {
    return { label: "Sin datos", detail: "NDVI no disponible." };
  }
  if (ndvi >= 0.6) {
    return { label: "Vegetación alta", detail: "Cobertura densa." };
  }
  if (ndvi >= 0.4) {
    return { label: "Vegetación media", detail: "Cobertura moderada." };
  }
  if (ndvi >= 0.2) {
    return { label: "Vegetación baja", detail: "Cobertura dispersa." };
  }
  return { label: "Vegetación muy baja", detail: "Cobertura mínima." };
};

const classifyNdwi = (ndwi) => {
  if (!Number.isFinite(ndwi)) {
    return { label: "Sin datos", detail: "NDWI no disponible." };
  }
  if (ndwi >= 0.3) {
    return { label: "Agua superficial", detail: "Humedad muy alta." };
  }
  if (ndwi >= 0.1) {
    return { label: "Humedad probable", detail: "Humedad moderada." };
  }
  if (ndwi >= 0) {
    return { label: "Humedad baja", detail: "Sin agua dominante." };
  }
  return { label: "Suelo seco", detail: "NDWI negativo." };
};

const buildEvidenceFromStats = (ndviMean, ndwiMean) => {
  const ndvi = classifyNdvi(ndviMean);
  const ndwi = classifyNdwi(ndwiMean);
  const ndviDetail = Number.isFinite(ndviMean) ? `NDVI medio ${ndviMean.toFixed(2)}.` : "";
  const ndwiDetail = Number.isFinite(ndwiMean) ? `NDWI medio ${ndwiMean.toFixed(2)}.` : "";

  return {
    water: {
      value: ndwi.label,
      detail: [ndwi.detail, ndwiDetail].filter(Boolean).join(" "),
    },
    landCover: {
      value: ndvi.label,
      detail: [ndvi.detail, ndviDetail].filter(Boolean).join(" "),
    },
    hydrology: {
      value: ndwi.label,
      detail: [ndwi.detail, ndwiDetail].filter(Boolean).join(" "),
    },
    vegetation: {
      value: ndvi.label,
      detail: [ndvi.detail, ndviDetail].filter(Boolean).join(" "),
    },
    source: "Planet Processing API (NDVI/NDWI)",
  };
};

const fetchPlanetProcessingSignals = async ({ coordinates, boundary }) => {
  if (!hasProcessingCredentials()) {
    return null;
  }

  const geometry = boundary || polygonFromCenter(coordinates, PLANET_SH_RADIUS_M);
  if (!geometry) {
    return null;
  }

  if (PLANET_SH_DATA_TYPE === "byoc" && !PLANET_SH_COLLECTION_ID) {
    return { error: "PLANET_SH_COLLECTION_ID required for BYOC processing." };
  }

  const to = new Date();
  const from = new Date(to.getTime() - PLANET_SH_TIME_RANGE_DAYS * 24 * 60 * 60 * 1000);

  let accessToken = "";
  try {
    accessToken = await fetchAccessToken();
  } catch (error) {
    return { error: error.message || "OAuth token error" };
  }

  if (!accessToken) {
    return { error: "OAuth token unavailable." };
  }

  const dataEntry = {
    type: PLANET_SH_DATA_TYPE,
    dataFilter: {
      timeRange: { from: from.toISOString(), to: to.toISOString() },
    },
  };
  if (Number.isFinite(PLANET_SH_MAX_CLOUD)) {
    dataEntry.dataFilter.maxCloudCoverage = PLANET_SH_MAX_CLOUD;
  }
  if (PLANET_SH_COLLECTION_ID) {
    dataEntry.collectionId = PLANET_SH_COLLECTION_ID;
  }

  const payload = {
    input: {
      bounds: { geometry },
      data: [dataEntry],
    },
    aggregation: {
      timeRange: { from: from.toISOString(), to: to.toISOString() },
      aggregationInterval: { of: "P1D" },
      evalscript: DEFAULT_EVALSCRIPT,
      resx: PLANET_SH_RES,
      resy: PLANET_SH_RES,
    },
    calculations: {
      default: {
        statistics: { default: {} },
      },
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PLANET_SH_TIMEOUT_MS);

  try {
    const response = await fetch(PLANET_SH_STATS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { error: `Processing stats error ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const rows = Array.isArray(data?.data) ? data.data : [];
    if (!rows.length) {
      return { error: "Processing stats returned no data." };
    }

    const ndviMean = collectBandMeans(rows, 0);
    const ndwiMean = collectBandMeans(rows, 1);

    return {
      ndviMean,
      ndwiMean,
      from: from.toISOString(),
      to: to.toISOString(),
      dataType: PLANET_SH_DATA_TYPE,
      collectionId: PLANET_SH_COLLECTION_ID || null,
      source: "Planet Processing API",
      evidence: buildEvidenceFromStats(ndviMean, ndwiMean),
    };
  } catch (error) {
    return { error: error.message || "Processing stats request failed" };
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = {
  fetchPlanetProcessingSignals,
};
