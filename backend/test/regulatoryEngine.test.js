const test = require("node:test");
const assert = require("node:assert/strict");

const { buildComplianceMatrix } = require("../src/v2/engines/regulatoryEngine");

test("Builds compliance matrix with legal basis and jurisdiction", () => {
  const result = buildComplianceMatrix({
    contradictions: [
      {
        code: "HYDRIC_NEUTRAL_VS_DISCHARGE",
        severity: "Bloqueante",
      },
    ],
    overlaps: [{ name: "Arroyo", type: "Curso de agua" }],
    regulatoryRefs: ["Ley 25.675"],
    mode: "EIA_QA",
    regulatorySignals: {
      coverage: {
        isSufficient: false,
        healthySources: 1,
        requiredThreshold: 2,
        criticalHealthy: 0,
        criticalRequired: 2,
      },
      sources: [],
    },
    caseData: {
      projectType: "Inmobiliario",
      location: {
        coordinates: { lat: -38.08, lng: -57.58 },
      },
      documents: {
        studyText: "Ley 25.675 y Ley 11.723",
      },
    },
    eia: { claims: [], specs: [] },
  });

  assert.ok(Array.isArray(result.rows));
  assert.ok(result.rows.length >= 5);
  assert.equal(result.jurisdiction, "AR-BA");
  assert.ok(result.rows.every((row) => row.legalBasis));
  assert.ok(result.rows.every((row) => Array.isArray(row.citations)));
  assert.ok(result.rows.some((row) => row.citations.length > 0));
});
