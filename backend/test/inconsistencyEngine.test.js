const test = require("node:test");
const assert = require("node:assert/strict");
const { detectInconsistencies } = require("../src/v2/engines/inconsistencyEngine");

test("Flags critical hydric contradiction", () => {
  const result = detectInconsistencies({
    claimsText: "El proyecto declara impacto neutral hídrico y sin impacto en arroyo.",
    specsText: "Incluye descarga de efluentes al arroyo con planta de tratamiento.",
    eia: null,
    overlaps: [],
    territorialSignals: null,
    planetProcessingSignals: null,
    mode: "PRE_EIA",
  });

  assert.equal(result.flags.hasCriticalHydric, true);
  assert.ok(result.contradictions.some((item) => item.code === "HYDRIC_NEUTRAL_VS_DISCHARGE"));
});

test("Detects no wetland vs wetland evidence", () => {
  const result = detectInconsistencies({
    claimsText: "",
    specsText: "",
    eia: {
      wetlands: { states_no_wetland: true },
      hydrology: {},
      vegetation: {},
      claims: [],
      specs: [],
    },
    overlaps: [{ type: "Wetlands" }],
    territorialSignals: { summary: { wetlands: 1, forests: 0 } },
    planetProcessingSignals: { ndwiMean: 0.25, ndviMean: 0.2 },
    mode: "EIA_QA",
  });

  assert.ok(result.contradictions.some((item) => item.code === "NO_WETLAND_VS_EVIDENCE"));
});
