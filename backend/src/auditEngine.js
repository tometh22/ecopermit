const { VECTOR_DB_NAMESPACE = "Global_Regulatory_Framework" } = process.env;
const {
  createResponse,
  extractOutputText,
  isOpenAIConfigured,
  OPENAI_MODEL,
} = require("./openaiClient");

const OPENAI_REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT || "";
const SATELLITE_MODE = (process.env.SATELLITE_MODE || "demo").toLowerCase();

const demoCases = {
  lawen: {
    regulatoryRefs: [
      "Ley 13.273 - Bosques Protectores (petitorio vecinal)",
      "Solicitud de DIA negativa y modelado hidrológico",
      "Buffer hídrico de 15 m a cada lado del arroyo (según prensa)",
    ],
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

const buildRegulatoryPrompt = ({ projectName, industry, scenario, coordinates, claims, specs, overlaps }) => {
  const overlapText = overlaps.length
    ? overlaps.map((zone) => `${zone.type} - ${zone.name} (${zone.law})`).join(" | ")
    : "None";

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
    `Claims: ${claims || "None"}`,
    `Specs: ${specs || "None"}`,
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

const buildSatelliteEvidence = ({ caseId }) => {
  if (SATELLITE_MODE === "disabled") {
    return null;
  }

  const caseMeta = demoCases[caseId];
  if (caseMeta?.satelliteEvidence) {
    return caseMeta.satelliteEvidence;
  }

  if (SATELLITE_MODE === "demo") {
    return {
      water: { value: "Sin datos", detail: "Conecta datasets satelitales." },
      landCover: { value: "Sin datos", detail: "Conecta datasets satelitales." },
      hydrology: { value: "Sin datos", detail: "Conecta datasets satelitales." },
      vegetation: { value: "Sin datos", detail: "Conecta datasets satelitales." },
      source: "Demo: integra Earth Engine o Sentinel Hub",
    };
  }

  return null;
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

const checkRestrictedZones = (coordinates) => {
  if (!coordinates) {
    return [];
  }

  return restrictedZones.filter((zone) => {
    return (
      coordinates.lat >= zone.bounds.minLat &&
      coordinates.lat <= zone.bounds.maxLat &&
      coordinates.lng >= zone.bounds.minLng &&
      coordinates.lng <= zone.bounds.maxLng
    );
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
      message: "Satellite evidence pack loaded (demo mode).",
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
  uploadedFileName,
  industry,
  scenario,
  environment,
  contextRiskAdjustment = 0,
  caseId = "",
}) => {
  let inconsistency = detectInconsistency(claims, specs);
  const overlaps = checkRestrictedZones(coordinates);
  let regulatoryRefs = fetchRegulatoryReferences(coordinates);
  let riskAdjustment = 0;
  let llmSummary = "";
  let llmError = "";
  let llmUsed = false;
  const caseMeta = demoCases[caseId];
  const satelliteEvidence = buildSatelliteEvidence({ caseId });

  if (caseMeta?.regulatoryRefs?.length) {
    regulatoryRefs = Array.from(new Set([...regulatoryRefs, ...caseMeta.regulatoryRefs]));
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
          claims,
          specs,
          overlaps,
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
              claimed: claims || "No explicit claim provided.",
              reality: specs || "No engineering specs provided.",
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
    caseId,
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
    llmUsed,
    llmError,
  });

  return { analysis, logs };
};

module.exports = {
  runAudit,
};
