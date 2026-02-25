const PLANET_API_KEY = process.env.PLANET_API_KEY || "";
const PLANET_BASE_URL = process.env.PLANET_BASE_URL || "https://api.planet.com";
const PLANET_ITEM_TYPES = (process.env.PLANET_ITEM_TYPES || "PSScene").split(",").map((item) => item.trim()).filter(Boolean);
const PLANET_LOOKBACK_DAYS = Number(process.env.PLANET_LOOKBACK_DAYS || 365);
const PLANET_PAGE_SIZE = Number(process.env.PLANET_PAGE_SIZE || 10);
const PLANET_MAX_CLOUD = process.env.PLANET_MAX_CLOUD ? Number(process.env.PLANET_MAX_CLOUD) : null;
const PLANET_TIMEOUT_MS = Number(process.env.PLANET_TIMEOUT_MS || 12000);
const PLANET_STATS_INTERVAL = (process.env.PLANET_STATS_INTERVAL || "month").toLowerCase();
const PLANET_STATS_UTC_OFFSET = process.env.PLANET_STATS_UTC_OFFSET || "";

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

const buildFilter = ({ geometry, lookbackDays }) => {
  const now = new Date();
  const gte = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const lte = now.toISOString();

  const config = [
    {
      type: "DateRangeFilter",
      field_name: "acquired",
      config: { gte, lte },
    },
    {
      type: "GeometryFilter",
      field_name: "geometry",
      config: geometry,
    },
  ];

  if (Number.isFinite(PLANET_MAX_CLOUD)) {
    config.push({
      type: "RangeFilter",
      field_name: "cloud_cover",
      config: { lte: PLANET_MAX_CLOUD },
    });
  }

  return { type: "AndFilter", config };
};

const fetchPlanetStats = async ({ filter }) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PLANET_TIMEOUT_MS);
  try {
    const payload = {
      item_types: PLANET_ITEM_TYPES,
      interval: PLANET_STATS_INTERVAL,
      filter,
    };
    if (PLANET_STATS_UTC_OFFSET) {
      payload.utc_offset = PLANET_STATS_UTC_OFFSET;
    }

    const response = await fetch(`${PLANET_BASE_URL}/data/v1/stats`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `api-key ${PLANET_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { error: `Planet stats error ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const buckets = Array.isArray(data?.buckets) ? data.buckets : [];
    const total = buckets.reduce((sum, bucket) => sum + (bucket.count || 0), 0);
    const average = buckets.length ? total / buckets.length : 0;
    const lastBucket = buckets[buckets.length - 1] || null;

    return {
      interval: data.interval || PLANET_STATS_INTERVAL,
      buckets,
      totalCount: total,
      averageCount: average,
      lastBucket,
    };
  } catch (error) {
    return { error: error.message || "Planet stats request failed" };
  } finally {
    clearTimeout(timeout);
  }
};

const fetchPlanetSignals = async ({ coordinates, boundary }) => {
  if (!PLANET_API_KEY || !PLANET_ITEM_TYPES.length) {
    return null;
  }

  const geometry = boundary || polygonFromCenter(coordinates, 1500);
  if (!geometry) {
    return null;
  }

  const filter = buildFilter({ geometry, lookbackDays: PLANET_LOOKBACK_DAYS });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PLANET_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${PLANET_BASE_URL}/data/v1/quick-search?_sort=acquired%20desc&_page_size=${PLANET_PAGE_SIZE}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `api-key ${PLANET_API_KEY}`,
        },
        body: JSON.stringify({ item_types: PLANET_ITEM_TYPES, filter }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return { error: `Planet error ${response.status}: ${errorText}` };
    }

    const payload = await response.json();
    const features = Array.isArray(payload?.features) ? payload.features : [];
    const count = features.length;
    const latest = features[0]?.properties?.acquired || null;
    const cloudValues = features
      .map((feature) => feature.properties?.cloud_cover)
      .filter((value) => Number.isFinite(value));
    const avgCloud = cloudValues.length
      ? cloudValues.reduce((sum, value) => sum + value, 0) / cloudValues.length
      : null;

    const stats = await fetchPlanetStats({ filter });

    return {
      count,
      latestAcquired: latest,
      avgCloudCover: avgCloud,
      itemTypes: PLANET_ITEM_TYPES,
      lookbackDays: PLANET_LOOKBACK_DAYS,
      source: "Planet Data API",
      stats,
    };
  } catch (error) {
    return { error: error.message || "Planet request failed" };
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = {
  fetchPlanetSignals,
};
