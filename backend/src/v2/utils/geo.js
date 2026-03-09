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

const ringsFromGeometry = (geometry) => {
  if (!geometry || !geometry.type) {
    return [];
  }

  if (geometry.type === "Polygon") {
    return Array.isArray(geometry.coordinates) ? geometry.coordinates.filter(Array.isArray) : [];
  }

  if (geometry.type === "MultiPolygon") {
    const rings = [];
    (geometry.coordinates || []).forEach((polygon) => {
      (polygon || []).forEach((ring) => {
        if (Array.isArray(ring)) {
          rings.push(ring);
        }
      });
    });
    return rings;
  }

  return [];
};

const pointsFromGeometry = (geometry) => {
  const points = [];
  walkGeometryCoordinates(geometry, (coord) => {
    const [lng, lat] = coord || [];
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      points.push([lng, lat]);
    }
  });
  return points;
};

const pointInRing = (point, ring) => {
  if (!Array.isArray(ring) || ring.length < 3) {
    return false;
  }
  const [x, y] = point || [];
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return false;
  }

  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i] || [];
    const [xj, yj] = ring[j] || [];
    if (!Number.isFinite(xi) || !Number.isFinite(yi) || !Number.isFinite(xj) || !Number.isFinite(yj)) {
      continue;
    }
    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
};

const orientation = (a, b, c) => {
  const val = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  if (Math.abs(val) < 1e-12) {
    return 0;
  }
  return val > 0 ? 1 : 2;
};

const onSegment = (a, b, c) => (
  b[0] <= Math.max(a[0], c[0]) + 1e-12
  && b[0] + 1e-12 >= Math.min(a[0], c[0])
  && b[1] <= Math.max(a[1], c[1]) + 1e-12
  && b[1] + 1e-12 >= Math.min(a[1], c[1])
);

const segmentsIntersect = (p1, q1, p2, q2) => {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  if (o1 === 0 && onSegment(p1, p2, q1)) {
    return true;
  }
  if (o2 === 0 && onSegment(p1, q2, q1)) {
    return true;
  }
  if (o3 === 0 && onSegment(p2, p1, q2)) {
    return true;
  }
  if (o4 === 0 && onSegment(p2, q1, q2)) {
    return true;
  }
  return false;
};

const normalizeRing = (ring) => {
  if (!Array.isArray(ring) || ring.length < 3) {
    return [];
  }
  const clean = ring
    .map((coord) => [Number(coord?.[0]), Number(coord?.[1])])
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
  if (clean.length < 3) {
    return [];
  }
  const first = clean[0];
  const last = clean[clean.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    clean.push(first);
  }
  return clean;
};

const ringIntersectsRing = (ringA, ringB) => {
  const a = normalizeRing(ringA);
  const b = normalizeRing(ringB);
  if (!a.length || !b.length) {
    return false;
  }

  for (let i = 0; i < a.length - 1; i += 1) {
    for (let j = 0; j < b.length - 1; j += 1) {
      if (segmentsIntersect(a[i], a[i + 1], b[j], b[j + 1])) {
        return true;
      }
    }
  }

  if (pointInRing(a[0], b) || pointInRing(b[0], a)) {
    return true;
  }

  return false;
};

const polygonIntersectsGeometry = (boundary, geometry) => {
  const boundaryRing = extractRing(boundary);
  if (!Array.isArray(boundaryRing) || boundaryRing.length < 3 || !geometry) {
    return false;
  }

  const boundaryBounds = boundsFromPolygon(boundary);
  const geometryBounds = boundsFromGeometry(geometry);
  if (!intersectsBounds(boundaryBounds, geometryBounds)) {
    return false;
  }

  const geometryRings = ringsFromGeometry(geometry);
  if (geometryRings.length) {
    return geometryRings.some((ring) => ringIntersectsRing(boundaryRing, ring));
  }

  const points = pointsFromGeometry(geometry);
  if (!points.length) {
    return false;
  }

  const normalizedBoundary = normalizeRing(boundaryRing);
  return points.some((point) => pointInRing(point, normalizedBoundary));
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
  pointInRing,
  ringIntersectsRing,
  polygonIntersectsGeometry,
  centroidFromBoundary,
};
