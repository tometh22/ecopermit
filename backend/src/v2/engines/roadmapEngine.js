const buildRoadmap = ({ contradictions, overlaps, decision, mode }) => {
  const actions = [];

  if (contradictions.some((item) => item.code === "HYDRIC_NEUTRAL_VS_DISCHARGE")) {
    actions.push({
      priority: "P1",
      title: "Reformular capítulo hídrico del EIA",
      detail: "Alinear claims con ingeniería de descarga/efluentes y modelación hidráulica.",
      estimatedCost: "Alto",
      timeline: "2-4 semanas",
      owner: "Equipo ambiental + hidráulica",
    });
  }

  if (overlaps.length) {
    actions.push({
      priority: "P1",
      title: "Ajustar huella de proyecto en zonas sensibles",
      detail: `Resolver ${overlaps.length} solapamientos con buffers y restricciones regulatorias.`,
      estimatedCost: "Medio/Alto",
      timeline: "2-6 semanas",
      owner: "Planning + legal ambiental",
    });
  }

  if (!actions.length) {
    actions.push({
      priority: "P2",
      title: "Validación técnica preventiva",
      detail: "Mantener monitoreo y actualizar evidencia satelital antes de presentación formal.",
      estimatedCost: "Bajo",
      timeline: "1-2 semanas",
      owner: "Equipo técnico",
    });
  }

  if (mode === "LIVING_EIA") {
    actions.push({
      priority: "P2",
      title: "Monitoreo periódico automatizado",
      detail: "Configurar alertas por delta de ICET y nuevas restricciones detectadas.",
      estimatedCost: "Bajo",
      timeline: "Continuo",
      owner: "Data/Compliance",
    });
  }

  return {
    decision,
    actions,
    generatedAt: new Date().toISOString(),
  };
};

module.exports = {
  buildRoadmap,
};
