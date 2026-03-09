const VECTOR_DB_NAMESPACE = process.env.VECTOR_DB_NAMESPACE || "Global_Regulatory_Framework";

const normalize = (value) => String(value || "").toLowerCase();

const toUnique = (values) => Array.from(new Set((values || []).filter(Boolean)));

const extractLegalMentions = (text) => {
  const source = String(text || "");
  if (!source.trim()) {
    return [];
  }

  const matches = [];
  const regex = /\b(ley|decreto|resoluci[oó]n|ord\.?|ordenanza)\s*(?:n[º°]\s*)?([\d]+(?:[./-]\d+)*)/gim;
  let match = regex.exec(source);
  while (match) {
    const kind = String(match[1] || "").toLowerCase();
    const num = String(match[2] || "").trim();
    if (kind && num) {
      matches.push(`${kind.toUpperCase()} ${num}`);
    }
    match = regex.exec(source);
  }
  return toUnique(matches);
};

const inferJurisdiction = ({ coordinates, eiaText }) => {
  const text = normalize(eiaText);
  if (text.includes("general pueyrred") || text.includes("mar del plata")) {
    return "AR-BA-MGP";
  }
  if (text.includes("buenos aires") || text.includes("provincia de buenos aires")) {
    return "AR-BA";
  }
  if (Number.isFinite(coordinates?.lat) && Number.isFinite(coordinates?.lng)) {
    if (coordinates.lat < -33 && coordinates.lat > -41 && coordinates.lng < -55 && coordinates.lng > -64) {
      return "AR-BA";
    }
  }
  return "AR";
};

const summarizeSourceHealth = (regulatorySignals) => {
  const coverage = regulatorySignals?.coverage || {};
  const sources = regulatorySignals?.sources || [];
  const georef = sources.filter((item) => !item.referenceOnly);
  const textual = sources.filter((item) => item.referenceOnly);

  return {
    healthyGeo: Number(coverage.healthySources || 0),
    requiredHealthy: Number(coverage.requiredThreshold || 0),
    totalGeo: georef.length,
    healthyCritical: Number(coverage.criticalHealthy || 0),
    totalCritical: Number(coverage.criticalRequired || 0),
    gateMode: coverage.gateMode || "minimum_healthy",
    textualConfigured: textual.filter((item) => item.configured).length,
    textualTotal: textual.length,
    isSufficient: Boolean(coverage.isSufficient),
  };
};

const statusFrom = ({ blocking = false, partial = false }) => {
  if (blocking) {
    return "No cumple";
  }
  if (partial) {
    return "Parcial";
  }
  return "Cumple";
};

const confidenceFromStatus = (status) => {
  if (status === "No cumple") {
    return "Alta";
  }
  if (status === "Parcial") {
    return "Media";
  }
  return "Media";
};

const buildObligations = ({
  contradictions,
  overlaps,
  regulatoryRefs,
  regulatorySignals,
  caseData,
  eia,
  mode,
}) => {
  const coordinates = caseData?.location?.coordinates || null;
  const jurisdiction = inferJurisdiction({
    coordinates,
    eiaText: caseData?.documents?.studyText || "",
  });
  const projectType = String(caseData?.projectType || "Inmobiliario");
  const eiaText = `${caseData?.documents?.studyText || ""}\n${(eia?.claims || []).join("\n")}\n${(eia?.notes || "")}`;
  const legalMentions = extractLegalMentions(eiaText);
  const sourceHealth = summarizeSourceHealth(regulatorySignals);

  const hasHydricCritical = contradictions.some((item) => item.code === "HYDRIC_NEUTRAL_VS_DISCHARGE");
  const hasSensitiveOverlap = overlaps.length > 0;
  const hasAnyRegRefs = (regulatoryRefs || []).length > 0;

  const rows = [];

  rows.push({
    requirement: "Presupuesto mínimo ambiental y EIA aplicable",
    legalBasis: "Ley 25.675 (Nación) · Ley 11.723 Anexo II (PBA)",
    evidence: legalMentions.some((item) => item.includes("LEY 25.675")) || legalMentions.some((item) => item.includes("LEY 11.723"))
      ? "El EIA menciona marco base de evaluación ambiental."
      : "No se encontró mención explícita completa del marco base en el documento cargado.",
    status: statusFrom({
      partial: !legalMentions.some((item) => item.includes("LEY 25.675") || item.includes("LEY 11.723")),
    }),
    confidence: confidenceFromStatus(
      statusFrom({ partial: !legalMentions.some((item) => item.includes("LEY 25.675") || item.includes("LEY 11.723")) })
    ),
    source: "EIA Extraction",
    jurisdiction,
    priority: "P1",
  });

  rows.push({
    requirement: "Integridad de declaración de impacto hídrico",
    legalBasis: "Ley 12.257 · Ley 5965 · Resoluciones ADA",
    evidence: hasHydricCritical
      ? "Contradicción crítica: claim hídrico neutral vs descarga/efluentes."
      : "Sin contradicción hídrica crítica automática.",
    status: statusFrom({ blocking: hasHydricCritical }),
    confidence: hasHydricCritical ? "Alta" : "Media",
    source: "Consistency Auditor",
    jurisdiction,
    priority: "P1",
  });

  rows.push({
    requirement: "Compatibilidad territorial y zonas sensibles",
    legalBasis: "Ordenamiento territorial + áreas sensibles",
    evidence: hasSensitiveOverlap
      ? `${overlaps.length} solapamientos detectados con capas georreferenciadas.`
      : "Sin solapamientos sensibles detectados en fuentes activas.",
    status: statusFrom({ partial: hasSensitiveOverlap }),
    confidence: hasSensitiveOverlap ? "Media" : "Media",
    source: "Geospatial Verifier",
    jurisdiction,
    priority: "P1",
  });

  rows.push({
    requirement: "Suficiencia de evidencia georreferenciada oficial",
    legalBasis: `${VECTOR_DB_NAMESPACE} - gate de validez`,
    evidence: `${sourceHealth.healthyGeo}/${sourceHealth.totalGeo} fuentes geo saludables (mínimo ${sourceHealth.requiredHealthy}) · críticas ${sourceHealth.healthyCritical}/${sourceHealth.totalCritical} · gate ${sourceHealth.gateMode}.`,
    status: sourceHealth.isSufficient ? "Cumple" : "No concluyente",
    confidence: sourceHealth.isSufficient ? "Alta" : "Baja",
    source: "Regulatory Source Registry",
    jurisdiction,
    priority: "P0",
  });

  rows.push({
    requirement: "Anclaje normativo textual al caso",
    legalBasis: "InfoLEG · Boletín Oficial · Normativa provincial/municipal",
    evidence: hasAnyRegRefs
      ? `${regulatoryRefs.length} referencias regulatorias vinculadas.`
      : "Sin referencias regulatorias vinculadas.",
    status: hasAnyRegRefs ? "Parcial" : "No concluyente",
    confidence: hasAnyRegRefs ? "Media" : "Baja",
    source: "Regulatory RAG",
    jurisdiction,
    priority: "P2",
  });

  if (mode === "LIVING_EIA") {
    rows.push({
      requirement: "Monitoreo y actualización de cumplimiento",
      legalBasis: "Control continuo de supuestos del EIA",
      evidence: "Living EIA activo con corridas periódicas.",
      status: "Cumple",
      confidence: "Alta",
      source: "Monitoring Scheduler",
      jurisdiction,
      priority: "P2",
    });
  }

  return { rows, legalMentions, jurisdiction };
};

const buildComplianceMatrix = ({
  contradictions,
  overlaps,
  regulatoryRefs,
  mode,
  regulatorySignals,
  caseData,
  eia,
}) => {
  const { rows, legalMentions, jurisdiction } = buildObligations({
    contradictions,
    overlaps,
    regulatoryRefs,
    mode,
    regulatorySignals,
    caseData,
    eia,
  });

  return {
    rows: rows.map((row) => ({
      requirement: row.requirement,
      legalBasis: row.legalBasis,
      evidence: row.evidence,
      status: row.status,
      confidence: row.confidence,
      source: row.source,
      jurisdiction: row.jurisdiction,
      priority: row.priority,
    })),
    legalMentions,
    jurisdiction,
  };
};

module.exports = {
  buildComplianceMatrix,
  extractLegalMentions,
  inferJurisdiction,
};
