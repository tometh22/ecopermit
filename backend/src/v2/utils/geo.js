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

const updateBoundsWithPoint = (bounds, lng, lat) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return bounds;
  }

  if (!bounds) {
    return {
      minLat: lat,
      maxLat: lat,
      minLng: lng,
      maxLng: lng,
    };
  }

  return {
    minLat: Math.min(bounds.minLat, lat),
    maxLat: Math.max(bounds.maxLat, lat),
    minLng: Math.min(bounds.minLng, lng),
    maxLng: Math.max(bounds.maxLng, lng),
  };
};

const walkGeometryCoordinates = (geometry, visit) => {
  if (!geometry || !geometry.type) {
    return;
  }

  const coords = geometry.coordinates;

  if (geometry.type === "Point") {
    visit(coords);
    return;
  }

  if (geometry.type === "MultiPoint" || geometry.type === "LineString") {
    (coords || []).forEach((point) => visit(point));
    return;
  }

  if (geometry.type === "MultiLineString" || geometry.type === "Polygon") {
    (coords || []).forEach((ring) => {
      (ring || []).forEach((point) => visit(point));
    });
    return;
  }

  if (geometry.type === "MultiPolygon") {
    (coords || []).forEach((polygon) => {
      (polygon || []).forEach((ring) => {
        (ring || []).forEach((point) => visit(point));
      });
    });
    return;
  }

  if (geometry.type === "GeometryCollection") {
    (geometry.geometries || []).forEach((sub) => walkGeometryCoordinates(sub, visit));
  }
};

const boundsFromGeometry = (geometry) => {
  let bounds = null;
  walkGeometryCoordinates(geometry, (point) => {
    const [lng, lat] = point || [];
    bounds = updateBoundsWithPoint(bounds, lng, lat);
  });
  return bounds;
};

const boundsFromFeature = (feature) => {
  if (!feature) {
    return null;
  }
  if (feature.type === "Feature") {
    return boundsFromGeometry(feature.geometry);
  }
  return boundsFromGeometry(feature);
};

const intersectsBounds = (a, b) => {
  if (!a || !b) {
    return false;
  }

  return (
    a.minLat <= b.maxLat &&
    a.maxLat >= b.minLat &&
    a.minLng <= b.maxLng &&
    a.maxLng >= b.minLng
  );
};

const pointInBounds = (point, bounds) => {
  if (!point || !bounds) {
    return false;
  }
  return (
    point.lat >= bounds.minLat &&
    point.lat <= bounds.maxLat &&
    point.lng >= bounds.minLng &&
    point.lng <= bounds.maxLng
  );
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
  boundsFromGeometry,
  boundsFromFeature,
  intersectsBounds,
  pointInBounds,
  centroidFromBoundary,
};
