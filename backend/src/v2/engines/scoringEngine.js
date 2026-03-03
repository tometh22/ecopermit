const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const scoreToLevel = (score) => {
  if (score >= 70) {
    return "Alto";
  }
  if (score >= 40) {
    return "Medio";
  }
  return "Bajo";
};

const scoreToMitigability = (score) => {
  if (score >= 70) {
    return "Baja";
  }
  if (score >= 40) {
    return "Media";
  }
  return "Alta";
};

const buildDimensionScores = ({
  overlaps,
  contradictionFlags,
  contradictions,
  environment,
  territorialSignals,
}) => {
  const overlapCount = overlaps?.length || 0;
  const wetlandHits = territorialSignals?.summary?.wetlands || 0;
  const protectedHits = territorialSignals?.summary?.protectedAreas || 0;
  const aqi = environment?.airQuality?.aqi;

  const physical = clamp(45 + overlapCount * 8 + wetlandHits * 4, 25, 95);
  const social = clamp(40 + contradictions.length * 10 + (protectedHits ? 8 : 0), 20, 95);
  const climate = clamp(48 + (Number.isFinite(aqi) ? Math.min(12, Math.round(aqi / 20)) : 0), 25, 92);
  const regulatory = clamp(42 + overlapCount * 9 + (contradictionFlags.hasCriticalHydric ? 16 : 0), 20, 96);
  const political = clamp(Math.round((social * 0.6) + (regulatory * 0.4) - 8), 20, 90);

  return [
    { key: "physical", label: "Riesgo físico", score: physical },
    { key: "climate", label: "Riesgo climático 2050", score: climate },
    { key: "social", label: "Riesgo social", score: social },
    { key: "regulatory", label: "Riesgo regulatorio", score: regulatory },
    { key: "political", label: "Riesgo político", score: political },
  ].map((item) => ({
    ...item,
    level: scoreToLevel(item.score),
    mitigability: scoreToMitigability(item.score),
  }));
};

const computePenaltyContext = ({
  restrictedAreaRatio,
  contradictionFlags,
  contradictions,
  socialConflictHigh,
}) => {
  const penalties = [];
  if (restrictedAreaRatio > 0.25) {
    penalties.push({ code: "RESTRICTED_AREA", points: 12, reason: ">25% del área en restricción" });
  }
  if (contradictionFlags.hasCriticalHydric) {
    penalties.push({ code: "CRITICAL_HYDRIC", points: 10, reason: "Contradicción hídrica crítica" });
  }
  if (contradictionFlags.hasWetlandEvidence && contradictions.length > 0) {
    penalties.push({ code: "WETLAND_SENSITIVE", points: 8, reason: "Evidencia de humedal/agua sensible" });
  }
  if (socialConflictHigh) {
    penalties.push({ code: "SOCIAL_CONFLICT", points: 6, reason: "Conflictividad social alta" });
  }
  return penalties;
};

const computeIcet = ({ indices, penalties }) => {
  const weights = {
    physical: 0.25,
    social: 0.2,
    climate: 0.2,
    regulatory: 0.2,
    political: 0.15,
  };

  const base = indices.reduce((sum, item) => sum + item.score * (weights[item.key] || 0), 0);
  const penaltyPoints = penalties.reduce((sum, p) => sum + p.points, 0);
  return clamp(Math.round(base + penaltyPoints), 0, 100);
};

const decisionFromIcet = (icet) => {
  if (icet >= 80) {
    return {
      code: "NOT_RECOMMENDED",
      label: "No recomendado",
      note: "Riesgo crítico detectado. Re-evaluar inversión o rediseñar alcance.",
      exposureLevel: "Riesgo crítico",
    };
  }
  if (icet >= 60) {
    return {
      code: "FIT_WITH_STRUCTURAL_REDESIGN",
      label: "Apto con rediseño estructural",
      note: "Requiere mitigaciones mayores antes de avanzar.",
      exposureLevel: "Riesgo alto",
    };
  }
  if (icet >= 35) {
    return {
      code: "FIT_WITH_MINOR_MITIGATIONS",
      label: "Apto con mitigaciones menores",
      note: "Viable con ajustes técnicos puntuales.",
      exposureLevel: "Riesgo medio",
    };
  }
  return {
    code: "FIT",
    label: "Apto",
    note: "Riesgo relativo bajo con monitoreo estándar.",
    exposureLevel: "Riesgo bajo",
  };
};

module.exports = {
  buildDimensionScores,
  computePenaltyContext,
  computeIcet,
  decisionFromIcet,
};
