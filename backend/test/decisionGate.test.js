const test = require("node:test");
const assert = require("node:assert/strict");

const { buildDecisionWithSufficiency } = require("../src/v2/orchestrator/runOrchestrator");

test("returns inconclusive decision when regulatory evidence is insufficient", () => {
  const decision = buildDecisionWithSufficiency({
    icet: 72,
    defaultDecision: {
      code: "FIT_WITH_STRUCTURAL_REDESIGN",
      label: "Apto con rediseño estructural",
      note: "Base decision",
      exposureLevel: "Riesgo alto",
    },
    regulatorySignals: {
      coverage: {
        isSufficient: false,
        requiredThreshold: 3,
        healthySources: 1,
        missingCritical: ["Inventario oficial de humedales"],
      },
    },
  });

  assert.equal(decision.code, "INCONCLUSIVE");
  assert.equal(decision.label, "No concluyente");
  assert.equal(decision.provisionalIcet, 72);
});

test("keeps computed decision when evidence coverage is sufficient", () => {
  const decision = buildDecisionWithSufficiency({
    icet: 45,
    defaultDecision: {
      code: "FIT_WITH_MINOR_MITIGATIONS",
      label: "Apto con mitigaciones menores",
      note: "Base decision",
      exposureLevel: "Riesgo medio",
    },
    regulatorySignals: {
      coverage: {
        isSufficient: true,
        requiredThreshold: 2,
        healthySources: 2,
      },
    },
  });

  assert.equal(decision.code, "FIT_WITH_MINOR_MITIGATIONS");
  assert.equal(decision.value, "FIT_WITH_MINOR_MITIGATIONS");
});
