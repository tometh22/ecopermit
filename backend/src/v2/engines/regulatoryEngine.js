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

const lawCitation = (law, url, extra = {}) => ({
  source: extra.source || "Normativa oficial",
  article: law,
  layer: extra.layer || "",
  date: extra.date || new Date().toISOString(),
  method: extra.method || "Regulatory mapping",
  url: url || "",
});

const JURISDICTION_OBLIGATIONS = {
  AR: {
    eiaBase: [
      lawCitation("Ley 25.675 (presupuestos mínimos)", "https://www.argentina.gob.ar/normativa"),
    ],
  },
  "AR-BA": {
    eiaBase: [
      lawCitation("Ley 25.675 (presupuestos mínimos)", "https://www.argentina.gob.ar/normativa"),
      lawCitation("Ley 11.723 Anexo II (EIA en PBA)", "https://normas.gba.gob.ar"),
    ],
    hydric: [
      lawCitation("Ley 12.257 (Código de Aguas PBA)", "https://normas.gba.gob.ar"),
      lawCitation("Ley 5965 (vuelco de efluentes)", "https://normas.gba.gob.ar"),
      lawCitation("Resolución ADA 2222/19", "https://www.gba.gob.ar/ada"),
    ],
    localPlanning: [
      lawCitation("Normativa de ordenamiento territorial municipal", "https://www.mardelplata.gob.ar/"),
    ],
  },
  "AR-BA-MGP": {
    eiaBase: [
      lawCitation("Ley 25.675 (presupuestos mínimos)", "https://www.argentina.gob.ar/normativa"),
      lawCitation("Ley 11.723 Anexo II (EIA en PBA)", "https://normas.gba.gob.ar"),
    ],
    hydric: [
      lawCitation("Ley 12.257 (Código de Aguas PBA)", "https://normas.gba.gob.ar"),
      lawCitation("Ley 5965 (vuelco de efluentes)", "https://normas.gba.gob.ar"),
      lawCitation("Resoluciones ADA aplicables", "https://www.gba.gob.ar/ada"),
    ],
    localPlanning: [
      lawCitation("Ordenamiento territorial y reglamentación local MGP", "https://www.mardelplata.gob.ar/"),
    ],
  },
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
  const sourceDate = regulatorySignals?.fetchedAt || new Date().toISOString();
  const obligationProfile = JURISDICTION_OBLIGATIONS[jurisdiction] || JURISDICTION_OBLIGATIONS["AR-BA"] || JURISDICTION_OBLIGATIONS.AR;

  const hasHydricCritical = contradictions.some((item) => item.code === "HYDRIC_NEUTRAL_VS_DISCHARGE");
  const hasSensitiveOverlap = overlaps.length > 0;
  const hasAnyRegRefs = (regulatoryRefs || []).length > 0;
  const hasEiaMismatch = contradictions.some((item) => item.code === "EIA_CASE_MISMATCH");

  const rows = [];
  const criticalSources = (regulatorySignals?.sources || []).filter((item) => item.critical);
  const overlapCitations = overlaps.slice(0, 4).map((item) => lawCitation(
    item.law || item.type,
    item.citationUrl || "",
    {
      source: item.sourceName || "Fuente georreferenciada",
      layer: item.type || "",
      date: sourceDate,
      method: "Spatial intersection",
    }
  ));

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
    citations: obligationProfile.eiaBase.map((item) => ({ ...item, date: sourceDate })),
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
    citations: (obligationProfile.hydric || []).map((item) => ({ ...item, date: sourceDate })),
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
    citations: overlapCitations.length ? overlapCitations : [
      lawCitation("Sin intersecciones críticas en capas georreferenciadas", "", {
        source: "Geospatial Verifier",
        date: sourceDate,
        method: "Spatial intersection",
      }),
    ],
  });

  rows.push({
    requirement: "Trazabilidad documental del expediente",
    legalBasis: "Integridad documental para trámite de EIA/DIA",
    evidence: hasEiaMismatch
      ? "El proyecto detectado en el PDF no coincide con el caso cargado."
      : "Documento EIA consistente con el caso cargado.",
    status: statusFrom({ blocking: hasEiaMismatch }),
    confidence: hasEiaMismatch ? "Alta" : "Media",
    source: "EIA Extraction",
    jurisdiction,
    priority: "P1",
    citations: [
      lawCitation("Control de integridad documental del expediente", "https://www.argentina.gob.ar/normativa", {
        source: "EIA Extraction",
        date: sourceDate,
        method: "NLP + metadata consistency check",
      }),
    ],
  });

  rows.push({
    requirement: "Compatibilidad regulatoria local por jurisdicción",
    legalBasis: "Normativa provincial/municipal de uso del suelo",
    evidence: `Jurisdicción inferida: ${jurisdiction}. Perfil normativo local aplicado al caso.`,
    status: "Cumple",
    confidence: "Media",
    source: "Regulatory Mapper",
    jurisdiction,
    priority: "P2",
    citations: (obligationProfile.localPlanning || []).map((item) => ({ ...item, date: sourceDate })),
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
    citations: criticalSources.map((item) => lawCitation(
      item.legalRef || item.name,
      item.citationUrl || "",
      {
        source: item.name,
        layer: item.layer || item.type || "",
        date: item.checkedAt || sourceDate,
        method: item.method || "Regulatory source query",
      }
    )),
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
    citations: (regulatorySignals?.sources || [])
      .filter((item) => item.referenceOnly && item.configured)
      .map((item) => lawCitation(item.legalRef || item.name, item.citationUrl || "", {
        source: item.name,
        date: item.checkedAt || sourceDate,
        method: "Textual legal retrieval",
      })),
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
      citations: [
        lawCitation("Control continuo de supuestos del EIA", "", {
          source: "Monitoring Scheduler",
          date: sourceDate,
          method: "Scheduled re-run",
        }),
      ],
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
      citations: Array.isArray(row.citations) ? row.citations : [],
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
