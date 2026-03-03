const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDimensionScores,
  computePenaltyContext,
  computeIcet,
  decisionFromIcet,
} = require("../src/v2/engines/scoringEngine");

test("ICET scoring clamps to 0..100", () => {
  const indices = [
    { key: "physical", score: 95 },
    { key: "social", score: 95 },
    { key: "climate", score: 95 },
    { key: "regulatory", score: 95 },
    { key: "political", score: 95 },
  ];
  const penalties = [{ points: 40 }];
  const icet = computeIcet({ indices, penalties });
  assert.equal(icet, 100);
});

test("Penalty context applies expected rules", () => {
  const penalties = computePenaltyContext({
    restrictedAreaRatio: 0.3,
    contradictionFlags: { hasCriticalHydric: true, hasWetlandEvidence: true },
    contradictions: [{ id: 1 }],
    socialConflictHigh: true,
  });
  const total = penalties.reduce((sum, item) => sum + item.points, 0);
  assert.equal(total, 36);
});

test("Decision thresholds match business rules", () => {
  assert.equal(decisionFromIcet(20).label, "Apto");
  assert.equal(decisionFromIcet(50).label, "Apto con mitigaciones menores");
  assert.equal(decisionFromIcet(65).label, "Apto con rediseño estructural");
  assert.equal(decisionFromIcet(85).label, "No recomendado");
});

test("Dimension scores return all five dimensions", () => {
  const scores = buildDimensionScores({
    overlaps: [{}, {}],
    contradictionFlags: { hasCriticalHydric: true },
    contradictions: [{}, {}],
    environment: { airQuality: { aqi: 120 } },
    territorialSignals: { summary: { wetlands: 1, protectedAreas: 1 } },
  });
  assert.equal(scores.length, 5);
  assert.ok(scores.every((item) => Number.isFinite(item.score)));
});
