const { createResponse, extractOutputText, isOpenAIConfigured } = require("../../openaiClient");

const OPENAI_REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT || "";

const safeJsonParse = (text) => {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
};

const cap = (arr, max) => arr.filter(Boolean).slice(0, max);

const buildFallbackNarrative = ({
  decision,
  validity,
  icet,
  topAlerts,
  roadmapActions,
  evidenceQuality,
}) => {
  const isConclusive = validity?.status === "CONCLUSIVE";
  const headline = `${decision?.label || "Resultado"} · ${isConclusive ? "Con evidencia suficiente" : "Resultado provisional"}`;
  const summary = isConclusive
    ? `ICET ${icet}/100. Puedes usar este resultado para due diligence preliminar.`
    : `ICET ${icet}/100. Antes de decidir, completa evidencia crítica faltante.`;
  const why = cap((topAlerts || []).map((item) => `${item.type}: ${item.message}`), 3);
  const actions = cap((roadmapActions || []).map((item) => `${item.priority} · ${item.title}`), 3);
  const caveats = [];
  if (!isConclusive) {
    caveats.push(validity?.note || "La validez es provisional.");
  }
  if (evidenceQuality?.score < 60) {
    caveats.push(`Calidad de evidencia ${evidenceQuality.score}/100 (${evidenceQuality.level || "Media"}).`);
  }

  return {
    source: "fallback",
    headline,
    summary,
    why,
    actions,
    caveats: cap(caveats, 2),
  };
};

const buildPrompt = ({
  caseName,
  mode,
  decision,
  validity,
  icet,
  topAlerts,
  indices,
  roadmapActions,
  evidenceQuality,
}) => {
  return [
    "Eres un analista senior de due diligence ambiental.",
    "Genera un resumen ejecutivo en español para dirección no técnica.",
    "Devuelve JSON válido sin markdown y solo con estas claves:",
    "- headline (string)",
    "- summary (string, 1 frase)",
    "- why (array de 2-3 frases breves)",
    "- actions (array de 2-3 acciones concretas de negocio)",
    "- caveats (array de 0-2 advertencias de validez/confianza)",
    "",
    "Reglas:",
    "- No inventes datos ni leyes no presentes en el input.",
    "- Si la validez es provisional, indícalo explícitamente.",
    "- Lenguaje claro y accionable.",
    "",
    "INPUT:",
    JSON.stringify({
      caseName,
      mode,
      decision,
      validity,
      icet,
      topAlerts,
      indices,
      roadmapActions,
      evidenceQuality,
    }),
  ].join("\n");
};

const buildAiNarrative = async ({
  caseName,
  mode,
  decision,
  validity,
  icet,
  topAlerts,
  indices,
  roadmapActions,
  evidenceQuality,
}) => {
  const fallback = buildFallbackNarrative({
    decision,
    validity,
    icet,
    topAlerts,
    roadmapActions,
    evidenceQuality,
  });

  if (!isOpenAIConfigured()) {
    return fallback;
  }

  try {
    const response = await createResponse({
      input: buildPrompt({
        caseName,
        mode,
        decision,
        validity,
        icet,
        topAlerts,
        indices,
        roadmapActions,
        evidenceQuality,
      }),
      instructions: "Devuelve JSON válido únicamente.",
      reasoningEffort: OPENAI_REASONING_EFFORT || undefined,
    });
    const text = extractOutputText(response);
    const parsed = safeJsonParse(text);
    if (!parsed || typeof parsed !== "object") {
      return fallback;
    }
    return {
      source: "openai",
      headline: String(parsed.headline || fallback.headline),
      summary: String(parsed.summary || fallback.summary),
      why: cap(Array.isArray(parsed.why) ? parsed.why.map(String) : fallback.why, 3),
      actions: cap(Array.isArray(parsed.actions) ? parsed.actions.map(String) : fallback.actions, 3),
      caveats: cap(Array.isArray(parsed.caveats) ? parsed.caveats.map(String) : fallback.caveats, 2),
    };
  } catch (_error) {
    return fallback;
  }
};

module.exports = {
  buildAiNarrative,
};

