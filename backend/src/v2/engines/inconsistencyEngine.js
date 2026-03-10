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

const sanitizeName = (text) => String(text || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const nameTokens = (text) => sanitizeName(text)
  .split(" ")
  .filter((token) => token.length >= 4)
  .filter((token) => !["proyecto", "estudio", "impacto", "ambiental", "barrio", "marco", "legal"].includes(token));

const isLikelyDocumentMismatch = (caseName, eiaProjectName) => {
  const caseTokens = nameTokens(caseName);
  const eiaTokens = nameTokens(eiaProjectName);
  if (!caseTokens.length || !eiaTokens.length) {
    return false;
  }

  const common = caseTokens.filter((token) => eiaTokens.includes(token));
  const overlapRatio = common.length / Math.min(caseTokens.length, eiaTokens.length);
  return overlapRatio < 0.34;
};

const detectInconsistencies = ({
  caseName,
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

  if (eia?.project_name && caseName && isLikelyDocumentMismatch(caseName, eia.project_name)) {
    contradictions.push({
      code: "EIA_CASE_MISMATCH",
      type: "Documental",
      severity: "Alta",
      message: `El documento EIA parece corresponder a "${eia.project_name}" y no al caso "${caseName}".`,
      legalConflict: "Riesgo de trazabilidad documental insuficiente para sustentar decisión.",
      legalBasis: ["Integridad documental del expediente", "Debida diligencia ambiental"],
      confidence: "Alta",
      evidence: [
        `Caso cargado: ${caseName}.`,
        `Proyecto detectado en EIA: ${eia.project_name}.`,
      ],
    });
  }

  if (hasNeutralHydricClaim && hasDischargeSpec) {
    contradictions.push({
      code: "HYDRIC_NEUTRAL_VS_DISCHARGE",
      type: "Hídrico",
      severity: "Bloqueante",
      message: "Claim hídrico neutral incompatible con descarga/efluentes en especificaciones.",
      legalConflict: "Riesgo de subdeclaración de impacto hídrico material.",
      legalBasis: ["Ley 12.257", "Ley 5965", "Régimen de permisos de vuelco"],
      confidence: "Alta",
      evidence: [
        "Claim menciona impacto hídrico neutral/sin afectación.",
        "Specs/EIA menciona descarga, efluente, desagüe o vuelco.",
      ],
    });
  }

  if (eia?.wetlands?.states_no_wetland === true && hasWetlandEvidence) {
    contradictions.push({
      code: "NO_WETLAND_VS_EVIDENCE",
      type: "Ambiental",
      severity: "Alta",
      message: "El EIA declara ausencia de humedal pero NDWI/OSM/solapes sugieren humedad significativa.",
      legalConflict: "Inconsistencia con criterios de protección de áreas sensibles.",
      legalBasis: ["Marco de protección de humedales/áreas sensibles"],
      confidence: wetlandFromNdwi || wetlandFromOverlaps ? "Alta" : "Media",
      evidence: [
        wetlandFromOverlaps ? "Solapes geográficos con capa hídrica/humedal." : "",
        wetlandFromTerritorial ? "Señales territoriales con humedales/cursos de agua." : "",
        wetlandFromNdwi ? "Índice NDWI elevado." : "",
      ].filter(Boolean),
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
      legalBasis: ["Normativa de bosque nativo/uso del suelo"],
      confidence: hasForestEvidence ? "Alta" : "Media",
      evidence: [
        "Claim de preservación detectado.",
        eia?.vegetation?.removal_planned === true ? "EIA indica remoción planificada." : "",
        hasForestEvidence ? "Cobertura boscosa detectada en señales geoespaciales." : "",
      ].filter(Boolean),
    });
  }

  if (eia?.hydrology?.mentions_flooding === false && hasWetlandEvidence) {
    contradictions.push({
      code: "LOW_HYDRIC_RISK_VS_EVIDENCE",
      type: "Hídrico",
      severity: "Media",
      message: "El estudio minimiza el riesgo hídrico pese a evidencia de cursos/humedales.",
      legalConflict: "Insuficiente caracterización hidrológica en línea base.",
      legalBasis: ["Evaluación hidrológica en EIA"],
      confidence: "Media",
      evidence: ["Indicadores hídricos presentes en territorio."],
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
