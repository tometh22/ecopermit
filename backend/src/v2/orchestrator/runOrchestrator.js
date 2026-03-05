const { getEnvironmentSignals } = require("../providers/environmentProvider");
const { getTerritorialSignals } = require("../providers/territorialProvider");
const { getSatelliteSignals } = require("../providers/satelliteProvider");
const { getRegulatorySignals } = require("../providers/regulatoryProvider");
const { getEiaInsights } = require("../providers/eiaProvider");
const { evaluateRestrictedZones } = require("../engines/restrictedZones");
const { detectInconsistencies } = require("../engines/inconsistencyEngine");
const {
  buildDimensionScores,
  computePenaltyContext,
  computeIcet,
  decisionFromIcet,
} = require("../engines/scoringEngine");
const { buildComplianceMatrix } = require("../engines/regulatoryEngine");
const { buildRoadmap } = require("../engines/roadmapEngine");
const { buildConfidencePack } = require("../engines/confidenceEngine");
const { buildAlerts } = require("../engines/executiveEngine");
const { centroidFromBoundary } = require("../utils/geo");

const VECTOR_DB_NAMESPACE = process.env.VECTOR_DB_NAMESPACE || "Global_Regulatory_Framework";

const MODE_LABELS = {
  PRE_EIA: "Pre‑EIA",
  EIA_QA: "EIA QA",
  LIVING_EIA: "Living EIA",
};

const ensureMode = (mode) => {
  const normalized = String(mode || "PRE_EIA").toUpperCase().replace(/-/g, "_");
  if (["PRE_EIA", "EIA_QA", "LIVING_EIA"].includes(normalized)) {
    return normalized;
  }
  return "PRE_EIA";
};

const parseClaimsSpecs = ({ claims, specs, eia }) => {
  const derivedClaims = (claims || "").trim() || (Array.isArray(eia?.claims) ? eia.claims.join(" ") : "");
  const derivedSpecs = (specs || "").trim() || (Array.isArray(eia?.specs) ? eia.specs.join(" ") : "");
  return { derivedClaims, derivedSpecs };
};

const inferRestrictedAreaRatio = ({ overlaps, territorialSignals, boundary }) => {
  if (!overlaps.length) {
    return 0;
  }

  const wetlandHits = territorialSignals?.summary?.wetlands || 0;
  const waterHits = (territorialSignals?.summary?.waterways || 0) + (territorialSignals?.summary?.waters || 0);

  if (wetlandHits + waterHits >= 3) {
    return 0.31;
  }
  if (boundary) {
    return 0.22;
  }
  return 0.15;
};

const buildTraceability = ({
  caseData,
  mode,
  environment,
  territorialSignals,
  regulatorySignals,
  planetSignals,
  processingSignals,
  eia,
}) => {
  const now = new Date().toISOString();
  return [
    {
      source: "Case Intake",
      timestamp: now,
      method: `Mode ${MODE_LABELS[mode]}`,
      confidence: "Alta",
      note: `Proyecto ${caseData.name || "Sin nombre"}`,
    },
    {
      source: "Google Air/Weather",
      timestamp: environment?.fetchedAt || now,
      method: "Official API",
      confidence: environment?.errors?.length ? "Media" : "Alta",
      note: environment?.errors?.length ? environment.errors.join(" | ") : "Contexto ambiental cargado",
    },
    {
      source: "OSM Overpass",
      timestamp: now,
      method: "Open data geospatial scan",
      confidence: territorialSignals?.error ? "Baja" : "Media",
      note: territorialSignals?.error || "Señales territoriales calculadas",
    },
    {
      source: "Regulatory Source Registry",
      timestamp: now,
      method: "Official georeferenced layers",
      confidence: regulatorySignals?.coverage?.isSufficient ? "Alta" : "Baja",
      note: regulatorySignals?.coverage
        ? `${regulatorySignals.coverage.healthySources}/${regulatorySignals.coverage.requiredThreshold} fuentes saludables`
        : "Sin cobertura regulatoria",
    },
    {
      source: "Planet",
      timestamp: now,
      method: "Scenes + Processing stats",
      confidence: planetSignals?.error && processingSignals?.error ? "Baja" : "Media",
      note: [planetSignals?.error, processingSignals?.error].filter(Boolean).join(" | ") || "Señales satelitales calculadas",
    },
    {
      source: "OpenAI Extraction",
      timestamp: now,
      method: "EIA structured extraction",
      confidence: eia?.error ? "Baja" : eia ? "Media" : "Baja",
      note: eia?.error || (eia ? "EIA parseado" : "Sin documento EIA"),
    },
  ];
};

const buildRegulatoryRefs = ({ coordinates, overlaps, territorialSignals }) => {
  const refs = [
    `${VECTOR_DB_NAMESPACE} Article 3 - Biodiversity Safeguards`,
    `${VECTOR_DB_NAMESPACE} Article 7 - Hydrographic Network Protection`,
  ];

  if (coordinates) {
    refs.push(`Jurisdiction overlay (${coordinates.lat.toFixed(4)}, ${coordinates.lng.toFixed(4)})`);
  }

  overlaps.forEach((zone) => refs.push(`${zone.law} (${zone.name})`));
  (territorialSignals?.regulatoryRefs || []).forEach((ref) => refs.push(ref));

  return Array.from(new Set(refs));
};

const buildDecisionWithSufficiency = ({ icet, defaultDecision, regulatorySignals }) => {
  const coverage = regulatorySignals?.coverage;
  if (!coverage?.isSufficient) {
    const missingText = coverage?.missingCritical?.length
      ? `Faltan fuentes críticas: ${coverage.missingCritical.join(", ")}.`
      : `Se requieren al menos ${coverage?.requiredThreshold || 1} fuentes regulatorias saludables.`;
    return {
      code: "INCONCLUSIVE",
      value: "INCONCLUSIVE",
      label: "No concluyente",
      note: `Resultado provisional. ${missingText}`,
      exposureLevel: "No concluyente",
      provisionalIcet: icet,
    };
  }

  return {
    ...defaultDecision,
    value: defaultDecision.code,
  };
};

const toLogs = ({
  mode,
  caseData,
  executiveResult,
  contradictions,
  overlaps,
  environment,
  planetSignals,
  processingSignals,
  regulatorySignals,
}) => {
  const logs = [
    { agent: "Case_Manager", message: `Modo ${MODE_LABELS[mode]} inicializado para ${caseData.name || "proyecto"}.` },
    { agent: "Validation", message: "Validando geometría, coordenadas y entradas documentales." },
    { agent: "Evidence_Engine", message: "Consultando señales ambientales y geoespaciales." },
    { agent: "Consistency_Auditor", message: `${contradictions.length} contradicciones detectadas.` },
    { agent: "Scoring_Engine", message: `ICET ${executiveResult.icet}/100 (${executiveResult.exposureLevel}).` },
    { agent: "Decision_Engine", message: `Decisión: ${executiveResult.decision.label}.` },
  ];

  if (overlaps.length) {
    logs.push({ agent: "Geospatial_Verifier", message: `${overlaps.length} zonas restringidas intersectadas.` });
  }
  if (!regulatorySignals?.coverage?.isSufficient) {
    logs.push({
      agent: "Regulatory_Gate",
      message: `Evidencia regulatoria insuficiente (${regulatorySignals?.coverage?.healthySources || 0}/${regulatorySignals?.coverage?.requiredThreshold || 0}).`,
    });
  }
  if (regulatorySignals?.warnings?.length) {
    logs.push({
      agent: "Regulatory_Provider",
      message: `Fuentes con error: ${regulatorySignals.warnings.join(" | ")}`,
    });
  }
  if (environment?.errors?.length) {
    logs.push({ agent: "Env_Provider", message: `Contexto parcial: ${environment.errors.join(" | ")}` });
  }
  if (planetSignals?.error || processingSignals?.error) {
    logs.push({
      agent: "Satellite_Provider",
      message: `Datos satelitales parciales: ${[planetSignals?.error, processingSignals?.error].filter(Boolean).join(" | ")}`,
    });
  }

  return logs.map((item) => ({
    ...item,
    timestamp: new Date().toISOString(),
  }));
};

const runCaseAnalysis = async ({ caseData, mode, monitoringContext = null }) => {
  const selectedMode = ensureMode(mode || caseData.modeDefaults?.primary || "PRE_EIA");
  const coordinates = caseData.location?.coordinates || centroidFromBoundary(caseData.boundaryGeoJSON);
  const boundary = caseData.boundaryGeoJSON || null;

  const [environment, territorialSignals, satellite, regulatorySignals] = await Promise.all([
    getEnvironmentSignals(coordinates),
    getTerritorialSignals({ coordinates, boundary }),
    getSatelliteSignals({ coordinates, boundary }),
    getRegulatorySignals({ coordinates, boundary }),
  ]);

  const eia = await getEiaInsights(caseData.documents?.studyText || "");
  const overlaps = evaluateRestrictedZones({ coordinates, boundary, regulatorySignals });
  const { derivedClaims, derivedSpecs } = parseClaimsSpecs({
    claims: caseData.claims,
    specs: caseData.specs,
    eia,
  });

  const { contradictions, flags } = detectInconsistencies({
    claimsText: derivedClaims,
    specsText: derivedSpecs,
    eia,
    overlaps,
    territorialSignals,
    planetProcessingSignals: satellite.processingSignals,
    mode: selectedMode,
  });

  const restrictedAreaRatio = inferRestrictedAreaRatio({ overlaps, territorialSignals, boundary });
  const socialConflictHigh = selectedMode === "LIVING_EIA" || contradictions.length >= 2;

  const indices = buildDimensionScores({
    overlaps,
    contradictionFlags: flags,
    contradictions,
    environment,
    territorialSignals,
  });

  const penalties = computePenaltyContext({
    restrictedAreaRatio,
    contradictionFlags: flags,
    contradictions,
    socialConflictHigh,
  });

  const icet = computeIcet({ indices, penalties });
  const baseDecision = decisionFromIcet(icet);
  const decision = buildDecisionWithSufficiency({
    icet,
    defaultDecision: baseDecision,
    regulatorySignals,
  });
  const alerts = buildAlerts({
    contradictions,
    overlaps,
    territorialSignals,
    planetSignals: satellite.planetSignals,
    environment,
    regulatorySignals,
  });

  const regulatoryRefs = Array.from(
    new Set(
      buildRegulatoryRefs({ coordinates, overlaps, territorialSignals }).concat(
        regulatorySignals?.regulatoryRefs || []
      )
    )
  );
  const complianceMatrix = buildComplianceMatrix({
    contradictions,
    overlaps,
    regulatoryRefs,
    mode: selectedMode,
    regulatorySignals,
  });

  const confidence = buildConfidencePack({
    environment,
    territorialSignals,
    planetSignals: satellite.planetSignals,
    planetProcessingSignals: satellite.processingSignals,
    eia,
    regulatorySignals,
  });

  const executiveResult = {
    decision,
    icet,
    exposureLevel: decision.exposureLevel,
    topAlerts: alerts,
    indices,
    penalties,
    restrictedAreaRatio,
    conclusive: Boolean(regulatorySignals?.coverage?.isSufficient),
    provisional: decision.code === "INCONCLUSIVE",
    sourceCoverage: regulatorySignals?.coverage || null,
    updatedAt: new Date().toISOString(),
  };

  const evidencePack = {
    regulatoryRefs,
    overlaps,
    environment,
    satellite: {
      scenes: satellite.planetSignals,
      processing: satellite.processingSignals,
    },
    contradictions,
    complianceMatrix,
    confidence,
    regulatorySources: regulatorySignals?.sources || [],
    sourceCoverage: regulatorySignals?.coverage || null,
    sourceWarnings: regulatorySignals?.warnings || [],
    traceability: buildTraceability({
      caseData,
      mode: selectedMode,
      environment,
      territorialSignals,
      regulatorySignals,
      planetSignals: satellite.planetSignals,
      processingSignals: satellite.processingSignals,
      eia,
    }),
    eia,
    territorialSignals,
  };

  const roadmap = buildRoadmap({
    contradictions,
    overlaps,
    decision,
    mode: selectedMode,
  });

  const kpis = {
    timeToFirstDecisionSeconds: 0,
    contradictions: contradictions.length,
    overlaps: overlaps.length,
    confidence: confidence.overall,
    regulatoryEvidenceSufficient: Boolean(regulatorySignals?.coverage?.isSufficient),
  };

  const logs = toLogs({
    mode: selectedMode,
    caseData,
    executiveResult,
    contradictions,
    overlaps,
    environment,
    planetSignals: satellite.planetSignals,
    processingSignals: satellite.processingSignals,
    regulatorySignals,
  });

  if (monitoringContext) {
    logs.unshift({
      agent: "Monitoring_Scheduler",
      message: `Run programado ejecutado (${monitoringContext.frequency || "manual"}).`,
      timestamp: new Date().toISOString(),
    });
  }

  return {
    mode: selectedMode,
    executiveResult,
    evidencePack,
    roadmap,
    kpis,
    logs,
  };
};

module.exports = {
  runCaseAnalysis,
  ensureMode,
  buildDecisionWithSufficiency,
};
