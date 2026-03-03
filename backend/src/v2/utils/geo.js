const toRadians = (deg) => (deg * Math.PI) / 180;

const metersToLat = (meters) => meters / 111320;

const metersToLng = (meters, lat) => {
  const cos = Math.cos(toRadians(lat));
  if (!Number.isFinite(cos) || Math.abs(cos) < 1e-6) {
    return 0;
  }
  return meters / (111320 * cos);
};

const polygonFromCenter = (coords, radiusMeters = 1500) => {
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

const extractRing = (boundary) => {
  if (!boundary) {
    return null;
  }
  if (boundary.type === "Feature") {
    return extractRing(boundary.geometry);
  }
  if (boundary.type === "FeatureCollection") {
    return extractRing(boundary.features?.[0]);
  }
  if (boundary.type === "Polygon") {
    return boundary.coordinates?.[0] || null;
  }
  if (boundary.type === "MultiPolygon") {
    return boundary.coordinates?.[0]?.[0] || null;
  }
  return boundary.coordinates?.[0] || null;
};

const boundsFromPolygon = (boundary) => {
  const ring = extractRing(boundary);
  if (!Array.isArray(ring) || ring.length === 0) {
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

  if (!Number.isFinite(minLat) || !Number.isFinite(minLng)) {
    return null;
  }

  return { minLat, maxLat, minLng, maxLng };
};

const centroidFromRing = (ring) => {
  if (!Array.isArray(ring) || ring.length === 0) {
    return null;
  }

  let latSum = 0;
  let lngSum = 0;
  let count = 0;

  for (const coord of ring) {
    const [lng, lat] = coord;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue;
    }
    latSum += lat;
    lngSum += lng;
    count += 1;
  }

  if (!count) {
    return null;
  }

  return { lat: latSum / count, lng: lngSum / count };
};

const centroidFromBoundary = (boundary) => {
  const ring = extractRing(boundary);
  return centroidFromRing(ring);
};

module.exports = {
  metersToLat,
  metersToLng,
  polygonFromCenter,
  extractRing,
  boundsFromPolygon,
  centroidFromBoundary,
};
