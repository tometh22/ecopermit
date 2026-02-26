const { VECTOR_DB_NAMESPACE = "Global_Regulatory_Framework" } = process.env;
const {
  createResponse,
  extractOutputText,
  isOpenAIConfigured,
  OPENAI_MODEL,
} = require("./openaiClient");

const OPENAI_REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT || "";
const SATELLITE_MODE = (process.env.SATELLITE_MODE || "demo").toLowerCase();
const EIA_EXTRACT_MODE = (process.env.EIA_EXTRACT_MODE || "auto").toLowerCase();

const demoCases = {
  lawen: {
    regulatoryRefs: [
      "Ley 13.273 - Bosques Protectores (petitorio vecinal)",
      "Solicitud de DIA negativa y modelado hidrológico",
      "Buffer hídrico de 15 m a cada lado del arroyo (según prensa)",
    ],
    executive: {
      indices: [
        { key: "physical", label: "Riesgo físico", score: 72, level: "Alto", mitigability: "Media" },
        { key: "climate", label: "Riesgo climático 2050", score: 65, level: "Alto", mitigability: "Baja" },
        { key: "social", label: "Riesgo social", score: 78, level: "Muy alto", mitigability: "Baja" },
        { key: "regulatory", label: "Riesgo regulatorio", score: 52, level: "Medio", mitigability: "Alta" },
        { key: "political", label: "Riesgo político", score: 46, level: "Medio", mitigability: "Media" },
      ],
      alerts: [
        {
          type: "Hídrico",
          message: "31% del predio en zona de recurrencia hídrica < 15 años.",
          severity: "Bloqueante",
        },
        {
          type: "Social",
          message: "Zona con 3 conflictos urbanos en los últimos 6 años.",
          severity: "Alta",
        },
        {
          type: "Ambiental",
          message: "Cercanía a humedal categorizado como área sensible.",
          severity: "Media",
        },
        {
          type: "Climático",
          message: "Proyección aumento precipitación extrema +18% (2050).",
          severity: "Media",
        },
      ],
      details: {
        physical:
          "Riesgo estructural alto: requiere rediseño hidráulico o reducción de huella construida.",
        social:
          "Alta probabilidad de conflicto si no se implementa licencia social temprana.",
        climate:
          "Incremento significativo de costos de adaptación futura por eventos extremos.",
        regulatory: "Viable con condicionamientos técnicos y revisión de buffer hídrico.",
        political:
          "Moderado: se requiere estrategia institucional y monitoreo de presión pública.",
      },
      decision: {
        label: "Apto con rediseño estructural",
        note: "Mitigaciones mayores requeridas antes de inversión.",
      },
      economic: {
        capex: "+14% CAPEX ambiental estimado",
        hydraulic: "Mitigación hidráulica prioritaria",
        scenario: "Escenario 2050: estrés hídrico creciente",
        note: "Indicativo. Ajustar con ingeniería de detalle.",
      },
    },
    satelliteEvidence: {
      water: {
        value: "Curso de agua presente",
        detail: "Arroyo Corrientes atraviesa el predio (prensa).",
      },
      landCover: {
        value: "Bosque/vegetación dominante",
        detail: "Entorno forestal continuo (estimación demo).",
      },
      hydrology: {
        value: "Cuenca sensible",
        detail: "Se solicita modelo hidrológico + inundación.",
      },
      vegetation: {
        value: "Cobertura alta",
        detail: "NDVI estimado (demo).",
      },
      source: "Demo: prensa + estimaciones preliminares",
    },
  },
};

const restrictedZones = [
  {
    name: "Blue Delta Wetlands",
    type: "Wetlands",
    bounds: { minLat: 29.1, maxLat: 30.4, minLng: -91.2, maxLng: -90.1 },
    law: "Clean Water Act §404",
  },
  {
    name: "Sierra Native Forest Reserve",
    type: "Native Forests",
    bounds: { minLat: 36.3, maxLat: 37.2, minLng: -120.1, maxLng: -118.8 },
    law: "Forest Protection Act Art. 18",
  },
  {
    name: "Cascadia Fault Corridor",
    type: "Fault Lines",
    bounds: { minLat: 44.2, maxLat: 46.2, minLng: -124.6, maxLng: -122.7 },
    law: "Seismic Safety Code Art. 7",
  },
  {
    name: "Bosque Peralta Ramos (Demo)",
    type: "Bosque protegido",
    bounds: { minLat: -38.105, maxLat: -38.065, minLng: -57.605, maxLng: -57.56 },
    law: "Ley 13.273 (petitorio vecinal)",
  },
  {
    name: "Arroyo Corrientes (Demo)",
    type: "Curso de agua",
    bounds: { minLat: -38.1, maxLat: -38.07, minLng: -57.595, maxLng: -57.565 },
    law: "Buffer hídrico 15 m (según prensa)",
  },
];

const normalize = (text) => (text || "").toLowerCase();
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const safeJsonParse = (text) => {
  if (!text) {
    return null;
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (error) {
    return null;
  }
};

const buildEiaPrompt = (documentText) => {
  const excerpt = (documentText || "").slice(0, 9000);
  return [
    "You are extracting structured facts from an Environmental Impact Assessment (EIA).",
    "Return JSON only with keys:",
    "- project_name (string)",
    "- location (string)",
    "- area_m2 (number or null)",
    "- lots (number or null)",
    "- density_ha (number or null)",
    "- water_withdrawal_m3_day (number or null)",
    "- buffer_m (number or null)",
    "- hydrology: { discharge_to_water: boolean|null, drainage: boolean|null, mentions_flooding: boolean|null }",
    "- vegetation: { mentions_forest: boolean|null, removal_planned: boolean|null }",
    "- wetlands: { mentions_wetland: boolean|null, states_no_wetland: boolean|null }",
    "- claims: array of key environmental claims (strings)",
    "- specs: array of engineering actions (strings)",
    "- mitigations: array of mitigation measures (strings)",
    "- notes: string (optional)",
    "",
    "If a field is not found, return null or empty array.",
    "",
    "EIA text:",
    excerpt,
  ].join("\n");
};

const normalizeBoolean = (value) => {
  if (value === true || value === false) {
    return value;
  }
  if (typeof value === "string") {
    const text = value.toLowerCase().trim();
    if (["yes", "si", "sí", "true", "verdadero"].includes(text)) {
      return true;
    }
    if (["no", "false", "falso"].includes(text)) {
      return false;
    }
  }
  return null;
};

const extractEiaInsights = async (documentText) => {
  if (!documentText || EIA_EXTRACT_MODE === "disabled" || !isOpenAIConfigured()) {
    return null;
  }

  try {
    const response = await createResponse({
      input: buildEiaPrompt(documentText),
      instructions: "Return JSON only.",
      reasoningEffort: OPENAI_REASONING_EFFORT || undefined,
    });
    const outputText = extractOutputText(response);
    const parsed = safeJsonParse(outputText);
    if (!parsed) {
      return { error: "Invalid EIA extraction output." };
    }

    const hydrology = parsed.hydrology || {};
    const vegetation = parsed.vegetation || {};
    const wetlands = parsed.wetlands || {};

    return {
      project_name: parsed.project_name || "",
      location: parsed.location || "",
      area_m2: Number.isFinite(parsed.area_m2) ? parsed.area_m2 : null,
      lots: Number.isFinite(parsed.lots) ? parsed.lots : null,
      density_ha: Number.isFinite(parsed.density_ha) ? parsed.density_ha : null,
      water_withdrawal_m3_day: Number.isFinite(parsed.water_withdrawal_m3_day)
        ? parsed.water_withdrawal_m3_day
        : null,
      buffer_m: Number.isFinite(parsed.buffer_m) ? parsed.buffer_m : null,
      hydrology: {
        discharge_to_water: normalizeBoolean(hydrology.discharge_to_water),
        drainage: normalizeBoolean(hydrology.drainage),
        mentions_flooding: normalizeBoolean(hydrology.mentions_flooding),
      },
      vegetation: {
        mentions_forest: normalizeBoolean(vegetation.mentions_forest),
        removal_planned: normalizeBoolean(vegetation.removal_planned),
      },
      wetlands: {
        mentions_wetland: normalizeBoolean(wetlands.mentions_wetland),
        states_no_wetland: normalizeBoolean(wetlands.states_no_wetland),
      },
      claims: Array.isArray(parsed.claims) ? parsed.claims.map(String) : [],
      specs: Array.isArray(parsed.specs) ? parsed.specs.map(String) : [],
      mitigations: Array.isArray(parsed.mitigations) ? parsed.mitigations.map(String) : [],
      notes: parsed.notes || "",
    };
  } catch (error) {
    return { error: error.message || "EIA extraction failed." };
  }
};

const pickClaimsSpecs = ({ claims, specs, eia }) => {
  const derivedClaims = (claims || "").trim()
    ? claims
    : eia?.claims?.length
      ? eia.claims.join(" ")
      : "";
  const derivedSpecs = (specs || "").trim()
    ? specs
    : eia?.specs?.length
      ? eia.specs.join(" ")
      : "";
  return { derivedClaims, derivedSpecs };
};

const detectEvidenceContradictions = ({
  claimsText,
  specsText,
  eia,
  territorialSignals,
  planetProcessingSignals,
}) => {
  const contradictions = [];
  const claims = normalize(claimsText);
  const specs = normalize(specsText);
  const eiaClaims = normalize((eia?.claims || []).join(" "));

  const summary = territorialSignals?.summary;
  const hasWaterEvidence = Boolean(
    (summary && summary.waterways + summary.waters > 0) ||
    (summary && summary.wetlands > 0) ||
    (Number.isFinite(planetProcessingSignals?.ndwiMean) && planetProcessingSignals.ndwiMean >= 0.2)
  );
  const hasWetlandEvidence = Boolean(
    (summary && summary.wetlands > 0) ||
    (Number.isFinite(planetProcessingSignals?.ndwiMean) && planetProcessingSignals.ndwiMean >= 0.2)
  );
  const hasForestEvidence = Boolean(
    (summary && summary.forests > 0) ||
    (Number.isFinite(planetProcessingSignals?.ndviMean) && planetProcessingSignals.ndviMean >= 0.55)
  );

  const neutralPhrases = ["neutral impact", "impacto neutral", "sin impacto", "no altera", "no afect"];
  const waterTokens = ["agua", "hídr", "hidro", "arroyo"];
  const mentionsNeutralWater = (text) =>
    neutralPhrases.some((phrase) => text.includes(phrase)) &&
    waterTokens.some((token) => text.includes(token));
  const declaresNoWaterImpact = mentionsNeutralWater(claims) || mentionsNeutralWater(eiaClaims);

  const mentionsDischarge =
    specs.includes("descarga") ||
    specs.includes("efluente") ||
    specs.includes("vuelco") ||
    specs.includes("planta de tratamiento") ||
    specs.includes("desagüe");

  if (declaresNoWaterImpact && (mentionsDischarge || eia?.hydrology?.discharge_to_water)) {
    contradictions.push({
      type: "Hídrico",
      message: "El estudio declara impacto hídrico bajo/neutral pero describe descargas o efluentes.",
      severity: "Bloqueante",
    });
  }

  if (eia?.wetlands?.states_no_wetland && hasWetlandEvidence) {
    contradictions.push({
      type: "Ambiental",
      message: "El estudio indica ausencia de humedal pero la evidencia satelital/GIS sugiere humedad.",
      severity: "Alta",
    });
  }

  if (eia?.vegetation?.removal_planned && hasForestEvidence && (claims.includes("preserv") || eiaClaims.includes("preserv"))) {
    contradictions.push({
      type: "Vegetación",
      message: "Se declara preservación del bosque pero hay remoción planificada con cobertura densa.",
      severity: "Media",
    });
  }

  if (eia?.hydrology?.mentions_flooding === false && hasWaterEvidence) {
    contradictions.push({
      type: "Hídrico",
      message: "El estudio minimiza riesgo hídrico pero se detectan cuerpos de agua en el área.",
      severity: "Media",
    });
  }

  return contradictions;
};

const buildRegulatoryPrompt = ({
  projectName,
  industry,
  scenario,
  coordinates,
  boundary,
  claims,
  specs,
  overlaps,
  documentText,
}) => {
  const overlapText = overlaps.length
    ? overlaps.map((zone) => `${zone.type} - ${zone.name} (${zone.law})`).join(" | ")
    : "None";
  const boundaryText = boundary ? "Boundary polygon provided." : "No polygon provided.";
  const excerpt = documentText ? documentText.slice(0, 2000) : "";

  return [
    "You are a regulatory auditor using the Global_Regulatory_Framework namespace.",
    "Return JSON only with keys:",
    "- regulatory_refs: array of short citations (strings)",
    "- legal_conflict: string (empty if none)",
    "- risk_adjustment: integer between -10 and 10",
    "- reasoning_summary: string (one sentence)",
    "",
    `Project: ${projectName || "Unnamed"}`,
    `Industry: ${industry || "Unknown"}`,
    `Scenario: ${scenario || "Unknown"}`,
    `Coordinates: ${coordinates ? `${coordinates.lat}, ${coordinates.lng}` : "Not provided"}`,
    boundaryText,
    `Claims: ${claims || "None"}`,
    `Specs: ${specs || "None"}`,
    excerpt ? "Document excerpt:" : "No document excerpt provided.",
    excerpt,
    `Restricted zone overlaps: ${overlapText}`,
  ].join("\n");
};

const detectInconsistency = (claimsText, specsText) => {
  const claims = normalize(claimsText);
  const specs = normalize(specsText);
  const hasNeutralImpact =
    claims.includes("neutral impact") ||
    claims.includes("impacto neutral") ||
    claims.includes("sin impacto") ||
    claims.includes("no altera") ||
    claims.includes("no afect");
  const mentionsWater =
    claims.includes("arroyo") || claims.includes("hidro") || claims.includes("hídr");
  const hasDischarge =
    specs.includes("resource extraction") ||
    specs.includes("discharge") ||
    specs.includes("descarga") ||
    specs.includes("vuelco") ||
    specs.includes("efluente") ||
    specs.includes("planta de tratamiento") ||
    specs.includes("desagüe") ||
    specs.includes("consumo de agua");

  if ((hasNeutralImpact || mentionsWater) && hasDischarge) {
    return {
      severity: "CRITICAL_ALERT",
      claimed: claimsText || "Neutral Impact declared for hydrological systems.",
      reality: specsText || "Engineering specs list resource extraction / discharge.",
      legal: `${VECTOR_DB_NAMESPACE} Article 12: Misrepresentation of material impact.`,
    };
  }

  if ((claimsText || "").trim() || (specsText || "").trim()) {
    return {
      severity: "Review",
      claimed: claimsText || "No explicit claim provided.",
      reality: specsText || "No engineering specs provided.",
      legal: "No direct conflict detected. Manual review recommended.",
    };
  }

  return null;
};

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

const buildDefaultIndices = ({ overlaps, inconsistency, environment }) => {
  const hasWaterOverlap = overlaps.some((zone) => zone.type.toLowerCase().includes("agua"));
  const physicalScore = hasWaterOverlap ? 68 : 45;
  const socialScore = inconsistency?.severity === "CRITICAL_ALERT" ? 70 : 42;
  const climateScore = environment?.weather ? 58 : 50;
  const regulatoryScore = inconsistency ? 60 : 46;
  const politicalScore = 40;

  return [
    {
      key: "physical",
      label: "Riesgo físico",
      score: physicalScore,
      level: scoreToLevel(physicalScore),
      mitigability: scoreToMitigability(physicalScore),
    },
    {
      key: "climate",
      label: "Riesgo climático 2050",
      score: climateScore,
      level: scoreToLevel(climateScore),
      mitigability: scoreToMitigability(climateScore),
    },
    {
      key: "social",
      label: "Riesgo social",
      score: socialScore,
      level: scoreToLevel(socialScore),
      mitigability: scoreToMitigability(socialScore),
    },
    {
      key: "regulatory",
      label: "Riesgo regulatorio",
      score: regulatoryScore,
      level: scoreToLevel(regulatoryScore),
      mitigability: scoreToMitigability(regulatoryScore),
    },
    {
      key: "political",
      label: "Riesgo político",
      score: politicalScore,
      level: scoreToLevel(politicalScore),
      mitigability: scoreToMitigability(politicalScore),
    },
  ];
};

const computeExecutiveScore = (indices, penalties) => {
  const weights = {
    physical: 0.25,
    social: 0.2,
    climate: 0.2,
    regulatory: 0.2,
    political: 0.15,
  };
  const base = indices.reduce((sum, item) => {
    const weight = weights[item.key] || 0;
    return sum + item.score * weight;
  }, 0);
  const penalty = penalties.reduce((sum, value) => sum + value, 0);
  return clamp(Math.round(base + penalty), 0, 100);
};

const buildExecutiveSummary = ({ caseId, overlaps, inconsistency, environment, extraAlerts = [] }) => {
  const caseMeta = demoCases[caseId];
  const indices = caseMeta?.executive?.indices || buildDefaultIndices({ overlaps, inconsistency, environment });
  const penalties = [];

  if (overlaps.length) {
    penalties.push(6);
  }
  if (inconsistency?.severity === "CRITICAL_ALERT") {
    penalties.push(10);
  }

  const exposureScore = computeExecutiveScore(indices, penalties);
  const exposureLevel = exposureScore >= 70 ? "Riesgo alto" : exposureScore >= 40 ? "Riesgo medio" : "Riesgo bajo";
  const baseAlerts =
    caseMeta?.executive?.alerts ||
    (overlaps.length || inconsistency
      ? [
          ...(overlaps.length
            ? [
                {
                  type: "Geoespacial",
                  message: `${overlaps.length} zona(s) sensible(s) intersectadas.`,
                  severity: "Alta",
                },
              ]
            : []),
          ...(inconsistency
            ? [
                {
                  type: "Coherencia técnica",
                  message: "Claims vs specs requieren revisión.",
                  severity: inconsistency.severity === "CRITICAL_ALERT" ? "Bloqueante" : "Media",
                },
              ]
            : []),
        ]
      : []);

  const alerts = [...baseAlerts, ...extraAlerts];

  const decision =
    caseMeta?.executive?.decision ||
    (exposureScore >= 80
      ? { label: "Riesgo crítico - reconsiderar inversión", note: "Bloqueantes detectados." }
      : exposureScore >= 60
        ? { label: "Apto con rediseño estructural", note: "Mitigaciones mayores requeridas." }
        : exposureScore >= 40
          ? { label: "Apto con mitigaciones menores", note: "Mitigaciones puntuales recomendadas." }
          : { label: "Apto", note: "Bajo riesgo relativo." });

  return {
    exposureScore,
    exposureLevel,
    summary: caseMeta?.executive ? "Exposición calculada con ICET y señales del caso." : "Exposición calculada con ICET.",
    indices,
    alerts,
    decision,
    details: caseMeta?.executive?.details,
    economic: caseMeta?.executive?.economic,
    updatedAt: new Date().toISOString(),
  };
};

const mergeEvidence = (...sources) => {
  const result = {
    water: null,
    landCover: null,
    hydrology: null,
    vegetation: null,
    source: "",
  };
  const sourceLabels = [];
  for (const source of sources) {
    if (!source) {
      continue;
    }
    if (source.water) {
      result.water = source.water;
    }
    if (source.landCover) {
      result.landCover = source.landCover;
    }
    if (source.hydrology) {
      result.hydrology = source.hydrology;
    }
    if (source.vegetation) {
      result.vegetation = source.vegetation;
    }
    if (source.source) {
      sourceLabels.push(source.source);
    }
  }
  if (sourceLabels.length) {
    result.source = Array.from(new Set(sourceLabels)).join(" · ");
  }
  return result;
};

const buildSatelliteEvidence = ({ caseId, territorialSignals, planetProcessingSignals }) => {
  if (SATELLITE_MODE === "disabled") {
    return null;
  }

  const caseMeta = demoCases[caseId];
  const baseEvidence = caseMeta?.satelliteEvidence
    || (SATELLITE_MODE === "demo"
      ? {
      water: { value: "Sin datos", detail: "Conecta datasets satelitales." },
      landCover: { value: "Sin datos", detail: "Conecta datasets satelitales." },
      hydrology: { value: "Sin datos", detail: "Conecta datasets satelitales." },
      vegetation: { value: "Sin datos", detail: "Conecta datasets satelitales." },
      source: "Demo: integra Earth Engine o Sentinel Hub",
    }
      : null);

  const territorialEvidence = territorialSignals?.evidence || null;
  const processingEvidence = planetProcessingSignals?.evidence || null;

  if (!baseEvidence && !territorialEvidence && !processingEvidence) {
    return null;
  }

  return mergeEvidence(baseEvidence, territorialEvidence, processingEvidence);
};

const fetchRegulatoryReferences = (coordinates) => {
  const refs = [
    `${VECTOR_DB_NAMESPACE}: Article 3 - Biodiversity Safeguards`,
    `${VECTOR_DB_NAMESPACE}: Article 7 - Hydrographic Network Protection`,
  ];

  if (coordinates) {
    refs.push(`Jurisdictional overlay for (${coordinates.lat.toFixed(2)}, ${coordinates.lng.toFixed(2)})`);
  }

  return refs;
};

const boundsFromPolygon = (boundary) => {
  if (!boundary) {
    return null;
  }
  const ring = boundary.type === "Polygon"
    ? boundary.coordinates?.[0]
    : boundary.type === "MultiPolygon"
      ? boundary.coordinates?.[0]?.[0]
      : boundary.coordinates?.[0];
  if (!Array.isArray(ring)) {
    return null;
  }
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const coord of ring) {
    const [lng, lat] = coord;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue;
    }
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }
  if (!Number.isFinite(minLat) || !Number.isFinite(maxLat)) {
    return null;
  }
  return { minLat, maxLat, minLng, maxLng };
};

const checkRestrictedZones = (coordinates, boundary) => {
  const bounds = boundary ? boundsFromPolygon(boundary) : null;
  if (!coordinates && !bounds) {
    return [];
  }

  return restrictedZones.filter((zone) => {
    if (bounds) {
      const intersects =
        bounds.minLat <= zone.bounds.maxLat &&
        bounds.maxLat >= zone.bounds.minLat &&
        bounds.minLng <= zone.bounds.maxLng &&
        bounds.maxLng >= zone.bounds.minLng;
      if (intersects) {
        return true;
      }
    }
    if (coordinates) {
      return (
        coordinates.lat >= zone.bounds.minLat &&
        coordinates.lat <= zone.bounds.maxLat &&
        coordinates.lng >= zone.bounds.minLng &&
        coordinates.lng <= zone.bounds.maxLng
      );
    }
    return false;
  });
};

const computeRisk = ({ hasFile, inconsistency, overlaps, riskAdjustment = 0 }) => {
  let riskScore = 18;
  if (hasFile) {
    riskScore += 6;
  }
  if (inconsistency?.severity === "CRITICAL_ALERT") {
    riskScore += 55;
  } else if (inconsistency) {
    riskScore += 18;
  }
  if (overlaps.length) {
    riskScore += 25;
  }
  riskScore += riskAdjustment;
  return clamp(riskScore, 0, 100);
};

const buildLogs = ({
  projectName,
  uploadedFileName,
  regulatoryRefs,
  inconsistency,
  overlaps,
  riskScore,
  environment,
  satelliteEvidence,
  territorialSignals,
  planetSignals,
  planetProcessingSignals,
  eia,
  contradictions,
  executive,
  llmUsed,
  llmError,
}) => {
  const logs = [
    {
      agent: "Project_Manager_Agent",
      message: `Ingesting project intake for ${projectName || "Unnamed Project"}.`,
    },
    {
      agent: "Project_Manager_Agent",
      message: uploadedFileName
        ? `Attached study file: ${uploadedFileName}.`
        : "No study file attached; continuing with manual inputs.",
    },
    {
      agent: "EIA_Extractor",
      message: eia?.error
        ? `EIA extraction error: ${eia.error}`
        : eia
          ? "EIA parsed and structured for analysis."
          : "EIA extraction skipped.",
    },
    {
      agent: "GeoJSON_Layer_Controller",
      message: "Composing project boundary and active map layers.",
    },
    {
      agent: "GPT_Reasoning_Engine",
      message: `Indexing ${VECTOR_DB_NAMESPACE} namespace (OpenAI ${OPENAI_MODEL}).`,
    },
    {
      agent: "Regulatory_RAG",
      message: "Vector DB query issued for jurisdictional regulatory anchors.",
    },
    ...(llmUsed
      ? [
          {
            agent: "OpenAI_Reasoning_Engine",
            message: `Model ${OPENAI_MODEL} analyzing regulatory anchors.`,
          },
        ]
      : []),
    {
      agent: "GPT_Reasoning_Engine",
      message: `Retrieved ${regulatoryRefs.length} regulatory anchors for coordinates.`,
    },
    {
      agent: "Consistency_Auditor",
      message: "Comparing Project_Claims vs Engineering_Specs.",
    },
    {
      agent: "Consistency_Auditor",
      message: inconsistency
        ? `Status: ${inconsistency.severity}.`
        : "Status: No inconsistencies detected.",
    },
    {
      agent: "Geospatial_Verifier",
      message: overlaps.length
        ? `Overlap detected with ${overlaps.length} restricted zone(s).`
        : "No overlap detected with restricted zones.",
    },
    {
      agent: "Automated_PDF_Generator",
      message: "Drafting correction roadmap and audit certificate.",
    },
    {
      agent: "Audit_Orchestrator",
      message: `Risk score computed at ${riskScore}/100.`,
    },
  ];

  if (executive) {
    logs.push({
      agent: "Executive_Scorecard",
      message: `ICET exposure score: ${executive.exposureScore}/100 (${executive.exposureLevel}).`,
    });
  }

  if (inconsistency?.severity === "CRITICAL_ALERT") {
    logs.push({
      agent: "Consistency_Auditor",
      message: "Trigger condition met: Neutral Impact claim vs resource extraction/discharge.",
    });
  } else if (inconsistency) {
    logs.push({
      agent: "Consistency_Auditor",
      message: "Claims/specs differ but no critical trigger detected.",
    });
  }

  if (overlaps.length) {
    const summary = overlaps.map((zone) => `${zone.type}: ${zone.name} (${zone.law})`).join(" | ");
    logs.push({
      agent: "Geospatial_Verifier",
      message: `Restricted zone(s) intersected: ${summary}.`,
    });
  }

  if (environment?.airQuality || environment?.weather) {
    const aqi = environment.airQuality?.aqi;
    const aqiLabel = environment.airQuality?.category || "Unknown";
    const temp = environment.weather?.temperatureC;
    const humidity = environment.weather?.humidity;
    const parts = [];
    if (Number.isFinite(aqi)) {
      parts.push(`AQI ${aqi} (${aqiLabel})`);
    }
    if (Number.isFinite(temp)) {
      parts.push(`Temp ${temp}°C`);
    }
    if (Number.isFinite(humidity)) {
      parts.push(`Humidity ${humidity}%`);
    }
    logs.push({
      agent: "Environmental_Context",
      message: parts.length
        ? `Environmental context loaded: ${parts.join(" | ")}.`
        : "Environmental context loaded.",
    });
  }

  if (satelliteEvidence) {
    logs.push({
      agent: "Satellite_Evidence_Engine",
      message: "Territorial evidence pack loaded.",
    });
  }

  if (territorialSignals?.error) {
    logs.push({
      agent: "Territorial_GIS",
      message: `GIS warning: ${territorialSignals.error}`,
    });
  }

  if (planetSignals) {
    logs.push({
      agent: "Planet_Data_API",
      message: planetSignals.error
        ? `Planet warning: ${planetSignals.error}`
        : `Planet scenes: ${planetSignals.count || 0}. Latest ${planetSignals.latestAcquired || "N/A"}.`,
    });
  }

  if (planetProcessingSignals) {
    const ndvi = Number.isFinite(planetProcessingSignals.ndviMean)
      ? planetProcessingSignals.ndviMean.toFixed(2)
      : "N/A";
    const ndwi = Number.isFinite(planetProcessingSignals.ndwiMean)
      ? planetProcessingSignals.ndwiMean.toFixed(2)
      : "N/A";
    logs.push({
      agent: "Planet_Processing_API",
      message: planetProcessingSignals.error
        ? `Processing warning: ${planetProcessingSignals.error}`
        : `NDVI ${ndvi} · NDWI ${ndwi}.`,
    });
  }

  if (contradictions?.length) {
    logs.push({
      agent: "Contradiction_Engine",
      message: `Contradictions detected: ${contradictions.length}.`,
    });
  }

  if (llmError) {
    logs.push({
      agent: "OpenAI_Reasoning_Engine",
      message: `LLM fallback applied: ${llmError}`,
    });
  }

  return logs;
};

const runAudit = async ({
  projectName,
  claims,
  specs,
  coordinates,
  boundary,
  documentText,
  uploadedFileName,
  industry,
  scenario,
  environment,
  territorialSignals,
  planetSignals,
  planetProcessingSignals,
  contextRiskAdjustment = 0,
  caseId = "",
}) => {
  const eia = await extractEiaInsights(documentText);
  const { derivedClaims, derivedSpecs } = pickClaimsSpecs({ claims, specs, eia });
  let inconsistency = detectInconsistency(derivedClaims, derivedSpecs);
  const overlaps = checkRestrictedZones(coordinates, boundary);
  let regulatoryRefs = fetchRegulatoryReferences(coordinates);
  let riskAdjustment = 0;
  let llmSummary = "";
  let llmError = "";
  let llmUsed = false;
  const caseMeta = demoCases[caseId];
  const satelliteEvidence = buildSatelliteEvidence({ caseId, territorialSignals, planetProcessingSignals });
  const extraAlerts = [...(territorialSignals?.alerts || [])];
  const contradictions = detectEvidenceContradictions({
    claimsText: derivedClaims,
    specsText: derivedSpecs,
    eia,
    territorialSignals,
    planetProcessingSignals,
  });

  if (contradictions.length) {
    contradictions.forEach((item) => {
      extraAlerts.push({
        type: item.type || "EIA",
        message: item.message,
        severity: item.severity || "Media",
      });
    });
  }

  if (caseMeta?.regulatoryRefs?.length) {
    regulatoryRefs = Array.from(new Set([...regulatoryRefs, ...caseMeta.regulatoryRefs]));
  }
  if (territorialSignals?.regulatoryRefs?.length) {
    regulatoryRefs = Array.from(new Set([...regulatoryRefs, ...territorialSignals.regulatoryRefs]));
  }

  if (planetSignals?.latestAcquired) {
    const daysOld = Math.round(
      (Date.now() - new Date(planetSignals.latestAcquired).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysOld > 180) {
      extraAlerts.push({
        type: "Satelital",
        message: `No hay imágenes recientes (última hace ${daysOld} días).`,
        severity: "Media",
      });
    }
  } else if (planetSignals?.count === 0) {
    extraAlerts.push({
      type: "Satelital",
      message: "Sin escenas satelitales detectadas en el período analizado.",
      severity: "Media",
    });
  }

  if (Number.isFinite(planetSignals?.avgCloudCover) && planetSignals.avgCloudCover > 0.6) {
    extraAlerts.push({
      type: "Satelital",
      message: "Alta nubosidad en escenas recientes.",
      severity: "Media",
    });
  }

  if (Number.isFinite(planetProcessingSignals?.ndwiMean)) {
    if (planetProcessingSignals.ndwiMean >= 0.2) {
      extraAlerts.push({
        type: "Satelital",
        message: "Índice NDWI sugiere presencia de agua/humedal.",
        severity: "Alta",
      });
    } else if (planetProcessingSignals.ndwiMean >= 0.1) {
      extraAlerts.push({
        type: "Satelital",
        message: "NDWI indica humedad superficial moderada.",
        severity: "Media",
      });
    }
  }

  if (Number.isFinite(planetProcessingSignals?.ndviMean) && planetProcessingSignals.ndviMean >= 0.6) {
    extraAlerts.push({
      type: "Satelital",
      message: "NDVI alto: cobertura vegetal densa.",
      severity: "Media",
    });
  }

  if (isOpenAIConfigured()) {
    llmUsed = true;
    try {
      const response = await createResponse({
        input: buildRegulatoryPrompt({
          projectName,
          industry,
          scenario,
          coordinates,
          boundary,
          claims: derivedClaims,
          specs: derivedSpecs,
          overlaps,
          documentText,
        }),
        instructions: "Return JSON only.",
        reasoningEffort: OPENAI_REASONING_EFFORT || undefined,
      });

      const outputText = extractOutputText(response);
      const parsed = safeJsonParse(outputText);

      if (parsed) {
        if (Array.isArray(parsed.regulatory_refs)) {
          const extraRefs = parsed.regulatory_refs.map((ref) => String(ref).trim()).filter(Boolean);
          regulatoryRefs = Array.from(new Set([...regulatoryRefs, ...extraRefs]));
        }

        if (typeof parsed.legal_conflict === "string" && parsed.legal_conflict.trim()) {
          if (inconsistency) {
            inconsistency = { ...inconsistency, legal: parsed.legal_conflict.trim() };
          } else {
            inconsistency = {
              severity: "Review",
              claimed: derivedClaims || "No explicit claim provided.",
              reality: derivedSpecs || "No engineering specs provided.",
              legal: parsed.legal_conflict.trim(),
            };
          }
        }

        if (Number.isFinite(parsed.risk_adjustment)) {
          riskAdjustment = clamp(Math.round(parsed.risk_adjustment), -10, 10);
        }

        if (typeof parsed.reasoning_summary === "string") {
          llmSummary = parsed.reasoning_summary.trim();
        }
      } else {
        llmError = "Invalid LLM output (non-JSON).";
      }
    } catch (error) {
      llmError = error.message || "OpenAI request failed.";
    }
  }

  const zoneSummary = overlaps.map((zone) => `${zone.type}: ${zone.name} (${zone.law})`).join(" | ") ||
    "No overlaps detected.";

  const executive = buildExecutiveSummary({
    caseId,
    overlaps,
    inconsistency,
    environment,
    extraAlerts,
  });

  const riskScore = computeRisk({
    hasFile: Boolean(uploadedFileName),
    inconsistency,
    overlaps,
    riskAdjustment: riskAdjustment + contextRiskAdjustment,
  });

  const analysis = {
    riskScore,
    inconsistency,
    regulatoryRefs,
    overlaps,
    zoneSummary,
    environment,
    contextRiskAdjustment,
    satelliteEvidence,
    territorialSignals,
    planetSignals,
    planetProcessingSignals,
    eia,
    contradictions,
    caseId,
    executive,
    llmSummary,
    riskAdjustment,
    llmUsed: llmUsed && !llmError,
  };

  const logs = buildLogs({
    projectName,
    uploadedFileName,
    regulatoryRefs,
    inconsistency,
    overlaps,
    riskScore,
    environment,
    satelliteEvidence,
    territorialSignals,
    planetSignals,
    planetProcessingSignals,
    eia,
    contradictions,
    executive,
    llmUsed,
    llmError,
  });

  return { analysis, logs };
};

module.exports = {
  runAudit,
};
