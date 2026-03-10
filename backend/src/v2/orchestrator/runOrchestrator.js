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
const { computeEvidenceQuality } = require("../engines/evidenceQualityEngine");
const { buildAlerts } = require("../engines/executiveEngine");
const { buildAiNarrative } = require("../engines/aiNarrativeEngine");
const { centroidFromBoundary } = require("../utils/geo");

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
  const coverage = regulatorySignals?.coverage || {};
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
      confidence: coverage?.isSufficient ? "Alta" : "Baja",
      note: `${coverage?.healthySources || 0}/${coverage?.requiredThreshold || 0} saludables · críticas ${coverage?.criticalHealthy || 0}/${coverage?.criticalRequired || 0}`,
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

const buildRegulatoryRefs = ({ coordinates, overlaps, territorialSignals, regulatorySignals, complianceMeta }) => {
  const refs = [];

  if (coordinates) {
    refs.push(`Jurisdicción del caso (${coordinates.lat.toFixed(4)}, ${coordinates.lng.toFixed(4)})`);
  }

  overlaps.forEach((zone) => refs.push(`${zone.law} (${zone.name})`));
  (territorialSignals?.regulatoryRefs || []).forEach((ref) => refs.push(ref));
  (regulatorySignals?.regulatoryRefs || []).forEach((ref) => refs.push(ref));
  (complianceMeta?.legalMentions || []).forEach((ref) => refs.push(`Mención EIA: ${ref}`));

  return Array.from(new Set(refs));
};

const buildDecisionWithSufficiency = ({ defaultDecision, regulatorySignals, evidenceQuality }) => {
  const coverage = regulatorySignals?.coverage || {};
  const missingText = coverage?.missingCritical?.length
    ? `Faltan fuentes críticas: ${coverage.missingCritical.join(", ")}.`
    : `Se requieren al menos ${coverage?.requiredThreshold || 1} fuentes georreferenciadas saludables.`;

  const isConclusive = Boolean(coverage?.isSufficient);
  const validity = isConclusive
    ? {
      status: "CONCLUSIVE",
      label: "Concluyente",
      note: "Evidencia suficiente para sustentar una decisión preliminar.",
    }
    : {
      status: "PROVISIONAL",
      label: "Provisional",
      note: `Resultado de riesgo válido como señal temprana, pero no concluyente para decisión final. ${missingText}`,
    };

  const adjustedNote = isConclusive
    ? defaultDecision.note
    : `${defaultDecision.note} (Validez: provisional por cobertura regulatoria insuficiente)`;

  return {
    decision: {
      ...defaultDecision,
      value: defaultDecision.code,
      note: adjustedNote,
    },
    validity,
    evidenceQuality,
  };
};

const buildRegulatorySummary = (regulatorySignals = {}) => {
  const coverage = regulatorySignals?.coverage || {};
  const sources = Array.isArray(regulatorySignals?.sources) ? regulatorySignals.sources : [];
  const geo = sources.filter((item) => !item.referenceOnly);
  const text = sources.filter((item) => item.referenceOnly);
  const errors = sources.filter((item) => item.status === "error");

  const healthyGeo = Number(coverage.healthySources || 0);
  const totalGeo = Number.isFinite(Number(coverage.georeferencedSources))
    ? Number(coverage.georeferencedSources)
    : geo.length;
  const criticalHealthy = Number(coverage.criticalHealthy || 0);
  const criticalRequired = Number(coverage.criticalRequired || 0);

  const gateMode = coverage.gateMode || "minimum_healthy";
  const gateLabel = gateMode === "critical" ? "Fuentes críticas" : "Cobertura mínima";
  const gateReason = coverage.isSufficient
    ? `${gateLabel} cumplido.`
    : gateMode === "critical"
      ? `Gate crítico incompleto: ${criticalHealthy}/${criticalRequired} fuentes críticas saludables.`
      : `Gate de cobertura incompleto: ${healthyGeo}/${coverage.requiredThreshold || 0} fuentes saludables.`;

  return {
    crossStatus: coverage.crossStatus || "No",
    isSufficient: Boolean(coverage.isSufficient),
    healthyGeo,
    totalGeo,
    criticalHealthy,
    criticalRequired,
    textualConfigured: text.filter((item) => item.configured).length,
    textualTotal: text.length,
    errors: errors.map((item) => ({
      sourceId: item.id,
      sourceName: item.name,
      message: item.error || "Error al consultar fuente",
    })),
    gateMode,
    gateReason,
  };
};

const buildContradictionCitations = ({ contradiction, regulatorySignals, runTimestamp }) => {
  const sources = Array.isArray(regulatorySignals?.sources) ? regulatorySignals.sources : [];
  const hydricSources = sources.filter((item) => /agua|h[ií]dr|hidro|arroyo|curso/i.test(`${item.type || ""} ${item.name || ""}`));
  const baseLegal = Array.isArray(contradiction?.legalBasis) ? contradiction.legalBasis : [];

  const citations = baseLegal.map((item) => ({
    source: "Normativa aplicable",
    article: item,
    layer: "",
    date: runTimestamp,
    method: "Legal mapping",
    url: "",
  }));

  if (contradiction?.code === "HYDRIC_NEUTRAL_VS_DISCHARGE") {
    hydricSources.slice(0, 3).forEach((source) => {
      citations.push({
        source: source.name,
        article: source.legalRef || "Referencia hídrica oficial",
        layer: source.layer || source.type || "",
        date: source.checkedAt || runTimestamp,
        method: source.method || "Regulatory source query",
        url: source.citationUrl || "",
      });
    });
  }

  return citations;
};

const enrichContradictions = ({ contradictions, regulatorySignals, runTimestamp }) =>
  (contradictions || []).map((item) => ({
    ...item,
    citations: buildContradictionCitations({ contradiction: item, regulatorySignals, runTimestamp }),
  }));

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
    { agent: "Evidence_Engine", message: "Consultando señales ambientales, satelitales y geoespaciales." },
    { agent: "Consistency_Auditor", message: `${contradictions.length} contradicciones detectadas.` },
    { agent: "Scoring_Engine", message: `ICET ${executiveResult.icet}/100 (${executiveResult.exposureLevel}).` },
    {
      agent: "Decision_Engine",
      message: `Decisión: ${executiveResult.decision.label}. Validez: ${executiveResult.validity.label}.`,
    },
  ];

  if (overlaps.length) {
    logs.push({ agent: "Geospatial_Verifier", message: `${overlaps.length} zonas restringidas intersectadas.` });
  }
  if (!regulatorySignals?.coverage?.isSufficient) {
    logs.push({
      agent: "Regulatory_Gate",
      message: `Evidencia regulatoria insuficiente: saludables ${regulatorySignals?.coverage?.healthySources || 0}/${regulatorySignals?.coverage?.georeferencedSources || 0} · críticas ${regulatorySignals?.coverage?.criticalHealthy || 0}/${regulatorySignals?.coverage?.criticalRequired || 0} (gate ${regulatorySignals?.coverage?.gateMode || "minimum_healthy"}).`,
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

  const { contradictions: rawContradictions, flags } = detectInconsistencies({
    caseName: caseData.name,
    claimsText: derivedClaims,
    specsText: derivedSpecs,
    eia,
    overlaps,
    territorialSignals,
    planetProcessingSignals: satellite.processingSignals,
    mode: selectedMode,
  });
  const runTimestamp = new Date().toISOString();
  const contradictions = enrichContradictions({
    contradictions: rawContradictions,
    regulatorySignals,
    runTimestamp,
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
  const confidence = buildConfidencePack({
    environment,
    territorialSignals,
    planetSignals: satellite.planetSignals,
    planetProcessingSignals: satellite.processingSignals,
    eia,
    regulatorySignals,
  });
  const evidenceQuality = computeEvidenceQuality({
    regulatorySignals,
    eia,
    satellite,
    environment,
    contradictions,
  });
  const decisionBundle = buildDecisionWithSufficiency({
    defaultDecision: baseDecision,
    regulatorySignals,
    evidenceQuality,
  });
  const regulatorySummary = buildRegulatorySummary(regulatorySignals);

  const compliancePack = buildComplianceMatrix({
    contradictions,
    overlaps,
    regulatoryRefs: regulatorySignals?.regulatoryRefs || [],
    mode: selectedMode,
    regulatorySignals,
    caseData,
    eia,
  });

  const regulatoryRefs = buildRegulatoryRefs({
    coordinates,
    overlaps,
    territorialSignals,
    regulatorySignals,
    complianceMeta: compliancePack,
  });

  const alerts = buildAlerts({
    contradictions,
    overlaps,
    territorialSignals,
    planetSignals: satellite.planetSignals,
    environment,
    regulatorySignals,
    evidenceQuality,
  });

  const executiveResult = {
    decision: decisionBundle.decision,
    validity: decisionBundle.validity,
    evidenceQuality,
    regulatorySummary,
    icet,
    exposureLevel: decisionBundle.decision.exposureLevel,
    topAlerts: alerts,
    indices,
    penalties,
    restrictedAreaRatio,
    conclusive: decisionBundle.validity.status === "CONCLUSIVE",
    provisional: decisionBundle.validity.status !== "CONCLUSIVE",
    sourceCoverage: regulatorySignals?.coverage || null,
    updatedAt: runTimestamp,
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
    complianceMatrix: compliancePack.rows,
    complianceMeta: {
      jurisdiction: compliancePack.jurisdiction,
      legalMentions: compliancePack.legalMentions,
    },
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
    decision: decisionBundle.decision,
    mode: selectedMode,
    regulatorySignals,
    complianceMatrix: compliancePack,
    evidenceQuality,
  });

  const aiNarrative = await buildAiNarrative({
    caseName: caseData.name,
    mode: selectedMode,
    decision: decisionBundle.decision,
    validity: decisionBundle.validity,
    icet,
    topAlerts: alerts,
    indices,
    roadmapActions: roadmap.actions || [],
    evidenceQuality,
  });
  executiveResult.aiNarrative = aiNarrative;

  const kpis = {
    timeToFirstDecisionSeconds: 0,
    contradictions: contradictions.length,
    overlaps: overlaps.length,
    confidence: confidence.overall,
    evidenceQuality,
    regulatoryEvidenceSufficient: Boolean(regulatorySignals?.coverage?.isSufficient),
    regulatoryCrossStatus: regulatorySummary.crossStatus,
    validity: decisionBundle.validity.status,
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
