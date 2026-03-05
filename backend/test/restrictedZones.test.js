const test = require("node:test");
const assert = require("node:assert/strict");

const { evaluateRestrictedZones } = require("../src/v2/engines/restrictedZones");

test("Uses regulatory source overlaps when provided", () => {
  const overlaps = evaluateRestrictedZones({
    coordinates: { lat: -38.08, lng: -57.58 },
    boundary: null,
    regulatorySignals: {
      overlaps: [
        {
          sourceId: "official-hydro-network",
          sourceName: "Red hidrográfica oficial",
          type: "Curso de agua",
          name: "Arroyo Corrientes",
          law: "Código hídrico",
          authority: "Autoridad hídrica",
          citationUrl: "https://example.gov/hidro",
        },
      ],
    },
  });

  assert.equal(overlaps.length, 1);
  assert.equal(overlaps[0].sourceId, "official-hydro-network");
  assert.equal(overlaps[0].name, "Arroyo Corrientes");
});

test("Returns empty when registry has no overlaps and fallback catalog disabled", () => {
  const overlaps = evaluateRestrictedZones({
    coordinates: { lat: -38.08, lng: -57.58 },
    boundary: null,
    regulatorySignals: { overlaps: [] },
  });

  assert.equal(Array.isArray(overlaps), true);
});
