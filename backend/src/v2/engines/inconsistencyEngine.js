const normalize = (text) => (text || "").toLowerCase();

const NEUTRAL_TOKENS = ["impacto neutral", "neutral impact", "sin impacto", "no altera", "no afect"];
const WATER_TOKENS = ["agua", "hídr", "hidro", "arroyo", "wetland", "humedal"];
const DISCHARGE_TOKENS = [
  "descarga",
  "discharge",
  "efluente",
  "vuelco",
  "desagüe",
  "resource extraction",
  "consumo de agua",
  "planta de tratamiento",
];

const mentionsAny = (text, tokens) => tokens.some((token) => text.includes(token));

const detectInconsistencies = ({
  claimsText,
  specsText,
  eia,
  overlaps,
  territorialSignals,
  planetProcessingSignals,
  mode,
}) => {
  const contradictions = [];
  const claims = normalize(claimsText);
  const specs = normalize(specsText);
  const eiaClaims = normalize((eia?.claims || []).join(" "));

  const hasNeutralHydricClaim =
    (mentionsAny(claims, NEUTRAL_TOKENS) || mentionsAny(eiaClaims, NEUTRAL_TOKENS))
    && (mentionsAny(claims, WATER_TOKENS) || mentionsAny(eiaClaims, WATER_TOKENS));

  const hasDischargeSpec = mentionsAny(specs, DISCHARGE_TOKENS) || eia?.hydrology?.discharge_to_water === true;

  const wetlandFromOverlaps = (overlaps || []).some((item) => /wetland|humedal|agua|arroyo|curso/i.test(item.type));
  const wetlandFromTerritorial = (territorialSignals?.summary?.wetlands || 0) > 0;
  const wetlandFromNdwi = Number.isFinite(planetProcessingSignals?.ndwiMean) && planetProcessingSignals.ndwiMean >= 0.2;
  const hasWetlandEvidence = wetlandFromOverlaps || wetlandFromTerritorial || wetlandFromNdwi;

  const forestFromOverlaps = (overlaps || []).some((item) => /forest|bosque/i.test(item.type));
  const forestFromTerritorial = (territorialSignals?.summary?.forests || 0) > 0;
  const forestFromNdvi = Number.isFinite(planetProcessingSignals?.ndviMean) && planetProcessingSignals.ndviMean >= 0.55;
  const hasForestEvidence = forestFromOverlaps || forestFromTerritorial || forestFromNdvi;

  if (hasNeutralHydricClaim && hasDischargeSpec) {
    contradictions.push({
      code: "HYDRIC_NEUTRAL_VS_DISCHARGE",
      type: "Hídrico",
      severity: "Bloqueante",
      message: "Claim hídrico neutral incompatible con descarga/efluentes en especificaciones.",
      legalConflict: "Riesgo de subdeclaración de impacto hídrico material.",
    });
  }

  if (eia?.wetlands?.states_no_wetland === true && hasWetlandEvidence) {
    contradictions.push({
      code: "NO_WETLAND_VS_EVIDENCE",
      type: "Ambiental",
      severity: "Alta",
      message: "El EIA declara ausencia de humedal pero NDWI/OSM/solapes sugieren humedad significativa.",
      legalConflict: "Inconsistencia con criterios de protección de áreas sensibles.",
    });
  }

  if (
    (claims.includes("preserv") || eiaClaims.includes("preserv"))
    && eia?.vegetation?.removal_planned === true
    && hasForestEvidence
  ) {
    contradictions.push({
      code: "PRESERVATION_VS_REMOVAL",
      type: "Vegetación",
      severity: "Alta",
      message: "Declaración de preservación con remoción planificada sobre cobertura boscosa densa.",
      legalConflict: "Potencial incumplimiento de condicionantes de conservación.",
    });
  }

  if (eia?.hydrology?.mentions_flooding === false && hasWetlandEvidence) {
    contradictions.push({
      code: "LOW_HYDRIC_RISK_VS_EVIDENCE",
      type: "Hídrico",
      severity: "Media",
      message: "El estudio minimiza el riesgo hídrico pese a evidencia de cursos/humedales.",
      legalConflict: "Insuficiente caracterización hidrológica en línea base.",
    });
  }

  if (mode === "EIA_QA" && contradictions.length === 0 && (claimsText || specsText)) {
    contradictions.push({
      code: "QA_REVIEW_REQUIRED",
      type: "QA",
      severity: "Media",
      message: "No se detectaron contradicciones fuertes automáticas; se recomienda revisión manual focalizada.",
      legalConflict: "Pendiente de validación técnica documental.",
    });
  }

  const hasCriticalHydric = contradictions.some(
    (item) => item.code === "HYDRIC_NEUTRAL_VS_DISCHARGE" && item.severity === "Bloqueante"
  );

  return {
    contradictions,
    flags: {
      hasCriticalHydric,
      hasWetlandEvidence,
      hasForestEvidence,
    },
  };
};

module.exports = {
  detectInconsistencies,
};
