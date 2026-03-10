const action = (payload) => ({
  priority: payload.priority || "P2",
  title: payload.title,
  detail: payload.detail,
  estimatedCost: payload.estimatedCost || "Medio",
  timeline: payload.timeline || "2-4 semanas",
  owner: payload.owner || "Equipo técnico",
  evidence: payload.evidence || [],
  legalBasis: payload.legalBasis || [],
});

const buildRoadmap = ({
  contradictions,
  overlaps,
  decision,
  mode,
  regulatorySignals,
  complianceMatrix,
  evidenceQuality,
}) => {
  const actions = [];
  const coverage = regulatorySignals?.coverage || {};

  if (contradictions.some((item) => item.code === "HYDRIC_NEUTRAL_VS_DISCHARGE")) {
    actions.push(action({
      priority: "P1",
      title: "Corregir consistencia hídrica del EIA",
      detail: "Alinear claims, ingeniería de efluentes y permisos de vuelco antes de presentación.",
      estimatedCost: "Alto",
      timeline: "2-4 semanas",
      owner: "Ambiente + Hidráulica + Legal",
      evidence: ["Contradicción HYDRIC_NEUTRAL_VS_DISCHARGE"],
      legalBasis: ["Ley 12.257", "Ley 5965", "Resoluciones ADA"],
    }));
  }

  if (contradictions.some((item) => item.code === "EIA_CASE_MISMATCH")) {
    actions.push(action({
      priority: "P1",
      title: "Validar identidad documental del EIA",
      detail: "Confirmar que el PDF cargado corresponde al proyecto evaluado y volver a ejecutar el análisis con expediente correcto.",
      estimatedCost: "Bajo",
      timeline: "24-72 horas",
      owner: "PM + Legal + Ambiente",
      evidence: ["Contradicción EIA_CASE_MISMATCH"],
      legalBasis: ["Integridad documental del expediente", "Debida diligencia ambiental"],
    }));
  }

  if (overlaps.length) {
    actions.push(action({
      priority: "P1",
      title: "Rediseñar huella en zonas sensibles",
      detail: `Resolver ${overlaps.length} solapamientos con buffers, ajustes de implantación y medidas compensatorias.`,
      estimatedCost: overlaps.length >= 2 ? "Medio/Alto" : "Medio",
      timeline: "2-6 semanas",
      owner: "Planeamiento + Ambiente",
      evidence: overlaps.slice(0, 3).map((item) => `${item.type}: ${item.name}`),
      legalBasis: overlaps.slice(0, 3).map((item) => item.law).filter(Boolean),
    }));
  }

  if (!coverage.isSufficient) {
    actions.push(action({
      priority: "P1",
      title: "Completar evidencia regulatoria oficial",
      detail: "Resolver fuentes críticas y volver a correr el análisis para decisión concluyente.",
      estimatedCost: "Bajo/Medio",
      timeline: "1-2 semanas",
      owner: "Data/Regulatory Ops",
      evidence: coverage.missingCritical || [],
      legalBasis: ["Gate de suficiencia regulatoria del modelo"],
    }));
  }

  if ((evidenceQuality?.score || 0) < 55) {
    actions.push(action({
      priority: "P2",
      title: "Elevar calidad probatoria del caso",
      detail: "Mejorar cobertura documental, trazabilidad y procesamiento satelital para reducir incertidumbre.",
      estimatedCost: "Bajo",
      timeline: "1-3 semanas",
      owner: "Equipo de due diligence",
      evidence: evidenceQuality?.blockers || [],
      legalBasis: ["Buenas prácticas de debida diligencia ambiental"],
    }));
  }

  const noCriticalFindings = contradictions.length === 0 && overlaps.length === 0 && coverage.isSufficient;
  if (!actions.length || noCriticalFindings) {
    actions.push(action({
      priority: "P2",
      title: "Seguimiento preventivo",
      detail: "Mantener monitoreo y verificar que no aparezcan nuevas restricciones o cambios de contexto.",
      estimatedCost: "Bajo",
      timeline: "Continuo",
      owner: "Compliance",
      evidence: [],
      legalBasis: ["Control y actualización periódica"],
    }));
  }

  if (mode === "LIVING_EIA") {
    actions.push(action({
      priority: "P2",
      title: "Operar monitoreo continuo",
      detail: "Configurar alertas por delta ICET, nuevas contradicciones y cambios en cobertura regulatoria.",
      estimatedCost: "Bajo",
      timeline: "Continuo",
      owner: "Data/Compliance",
      evidence: ["Runs periódicos Living EIA"],
      legalBasis: ["Gobierno continuo de riesgo territorial"],
    }));
  }

  return {
    decision,
    actions,
    complianceHighlights: (complianceMatrix?.rows || [])
      .filter((row) => row.status !== "Cumple")
      .slice(0, 4)
      .map((row) => ({
        requirement: row.requirement,
        status: row.status,
        legalBasis: row.legalBasis,
        source: row.source,
      })),
    generatedAt: new Date().toISOString(),
  };
};

module.exports = {
  buildRoadmap,
};
