const VECTOR_DB_NAMESPACE = process.env.VECTOR_DB_NAMESPACE || "Global_Regulatory_Framework";

const buildComplianceMatrix = ({ contradictions, overlaps, regulatoryRefs, mode, regulatorySignals }) => {
  const matrix = [];
  const sourceCoverage = regulatorySignals?.coverage || null;

  matrix.push({
    requirement: `${VECTOR_DB_NAMESPACE} - Compatibilidad de uso y localización`,
    evidence: overlaps.length
      ? `${overlaps.length} solapamientos sensibles detectados.`
      : "Sin solapamientos sensibles en chequeo inicial.",
    status: overlaps.length ? "Parcial" : "Cumple",
    confidence: overlaps.length ? "Media" : "Media",
    source: "Geospatial Verifier",
  });

  matrix.push({
    requirement: `${VECTOR_DB_NAMESPACE} - Integridad de declaración de impacto`,
    evidence: contradictions.length
      ? `${contradictions.length} contradicciones entre claims, specs y evidencia.`
      : "Sin contradicciones automáticas fuertes.",
    status: contradictions.some((item) => item.severity === "Bloqueante") ? "No cumple" : contradictions.length ? "Parcial" : "Cumple",
    confidence: contradictions.length ? "Alta" : "Media",
    source: "Consistency Auditor",
  });

  matrix.push({
    requirement: `${VECTOR_DB_NAMESPACE} - Soporte probatorio ambiental`,
    evidence: regulatoryRefs.length
      ? `${regulatoryRefs.length} referencias regulatorias vinculadas.`
      : "Sin referencias regulatorias enriquecidas.",
    status: regulatoryRefs.length ? "Parcial" : "Parcial",
    confidence: regulatoryRefs.length ? "Media" : "Baja",
    source: "Regulatory RAG",
  });

  matrix.push({
    requirement: `${VECTOR_DB_NAMESPACE} - Suficiencia de fuentes oficiales georreferenciadas`,
    evidence: sourceCoverage
      ? `${sourceCoverage.healthySources}/${sourceCoverage.requiredThreshold} fuentes georreferenciadas saludables. Críticas: ${sourceCoverage.criticalHealthy}/${sourceCoverage.criticalRequired}.`
      : "Sin evaluación de cobertura regulatoria.",
    status: sourceCoverage?.isSufficient ? "Cumple" : "No concluyente",
    confidence: sourceCoverage?.isSufficient ? "Alta" : "Baja",
    source: "Regulatory Source Registry",
  });

  if (mode === "LIVING_EIA") {
    matrix.push({
      requirement: `${VECTOR_DB_NAMESPACE} - Seguimiento y actualización periódica`,
      evidence: "Modo Living EIA activo con corridas periódicas configurables.",
      status: "Cumple",
      confidence: "Alta",
      source: "Monitoring Scheduler",
    });
  }

  return matrix;
};

module.exports = {
  buildComplianceMatrix,
};
