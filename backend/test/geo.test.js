const test = require("node:test");
const assert = require("node:assert/strict");
const {
  boundsFromPolygon,
  centroidFromBoundary,
  polygonIntersectsGeometry,
} = require("../src/v2/utils/geo");

test("Computes bounds from polygon", () => {
  const polygon = {
    type: "Polygon",
    coordinates: [[
      [-57.6, -38.1],
      [-57.5, -38.1],
      [-57.5, -38.0],
      [-57.6, -38.0],
      [-57.6, -38.1],
    ]],
  };

  const bounds = boundsFromPolygon(polygon);
  assert.equal(bounds.minLat, -38.1);
  assert.equal(bounds.maxLat, -38.0);
  assert.equal(bounds.minLng, -57.6);
  assert.equal(bounds.maxLng, -57.5);
});

test("Computes centroid from boundary", () => {
  const polygon = {
    type: "Polygon",
    coordinates: [[
      [-57.6, -38.1],
      [-57.5, -38.1],
      [-57.5, -38.0],
      [-57.6, -38.0],
    ]],
  };

  const center = centroidFromBoundary(polygon);
  assert.ok(Number.isFinite(center.lat));
  assert.ok(Number.isFinite(center.lng));
});

test("Detects polygon intersection with feature geometry", () => {
  const project = {
    type: "Polygon",
    coordinates: [[
      [-57.6, -38.1],
      [-57.5, -38.1],
      [-57.5, -38.0],
      [-57.6, -38.0],
      [-57.6, -38.1],
    ]],
  };
  const external = {
    type: "Polygon",
    coordinates: [[
      [-57.55, -38.08],
      [-57.45, -38.08],
      [-57.45, -37.98],
      [-57.55, -37.98],
      [-57.55, -38.08],
    ]],
  };

  assert.equal(polygonIntersectsGeometry(project, external), true);
});
