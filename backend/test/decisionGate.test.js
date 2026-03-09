const test = require("node:test");
const assert = require("node:assert/strict");

const { buildDecisionWithSufficiency } = require("../src/v2/orchestrator/runOrchestrator");

test("returns inconclusive decision when regulatory evidence is insufficient", () => {
  const bundle = buildDecisionWithSufficiency({
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
    evidenceQuality: { score: 41, level: "Baja" },
  });

  assert.equal(bundle.decision.code, "FIT_WITH_STRUCTURAL_REDESIGN");
  assert.equal(bundle.validity.status, "PROVISIONAL");
  assert.equal(bundle.validity.label, "Provisional");
});

test("keeps computed decision when evidence coverage is sufficient", () => {
  const bundle = buildDecisionWithSufficiency({
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
    evidenceQuality: { score: 78, level: "Alta" },
  });

  assert.equal(bundle.decision.code, "FIT_WITH_MINOR_MITIGATIONS");
  assert.equal(bundle.decision.value, "FIT_WITH_MINOR_MITIGATIONS");
  assert.equal(bundle.validity.status, "CONCLUSIVE");
});
