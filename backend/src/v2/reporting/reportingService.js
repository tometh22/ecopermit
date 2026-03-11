const escapePdfText = (text) => String(text || "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const MAX_PDF_LINE_LENGTH = 100;
const LINES_PER_PAGE = 48;

const wrapLine = (line, maxLength = MAX_PDF_LINE_LENGTH) => {
  const raw = String(line || "");
  if (!raw.length) return [""];
  if (raw.length <= maxLength) return [raw];

  const words = raw.split(/\s+/).filter(Boolean);
  if (!words.length) return [raw.slice(0, maxLength)];

  const wrapped = [];
  let current = "";
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxLength) {
      current = candidate;
      return;
    }

    if (current) {
      wrapped.push(current);
      current = "";
    }

    if (word.length <= maxLength) {
      current = word;
      return;
    }

    for (let i = 0; i < word.length; i += maxLength) {
      wrapped.push(word.slice(i, i + maxLength));
    }
  });

  if (current) wrapped.push(current);
  return wrapped;
};

const splitToPdfLines = (lines) =>
  (lines || []).flatMap((line) => {
    return wrapLine(line);
  });

const truncate = (value, max = 180) => {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
};

const formatIso = (value) => {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toISOString();
};

const normalizeCitation = (citation, origin) => {
  if (!citation || typeof citation !== "object") return null;
  return {
    origin: origin || citation.origin || "N/A",
    source: citation.source || "--",
    article: citation.article || "--",
    layer: citation.layer || "--",
    date: formatIso(citation.date || citation.checkedAt || citation.timestamp),
    method: citation.method || "--",
    url: citation.url || citation.citationUrl || "",
  };
};

const collectCitations = (run) => {
  const matrixCitations = (run.evidencePack?.complianceMatrix || []).flatMap((row) => {
    const origin = `Matriz: ${row.requirement || "Sin requisito"}`;
    return (row.citations || [])
      .map((citation) => normalizeCitation(citation, origin))
      .filter(Boolean);
  });

  const contradictionCitations = (run.evidencePack?.contradictions || []).flatMap((item) => {
    const origin = `Contradiccion: ${item.code || item.type || "Sin codigo"}`;
    return (item.citations || [])
      .map((citation) => normalizeCitation(citation, origin))
      .filter(Boolean);
  });

  const all = [...matrixCitations, ...contradictionCitations];
  const dedup = new Map();
  all.forEach((citation) => {
    const key = [
      citation.origin,
      citation.source,
      citation.article,
      citation.layer,
      citation.date,
      citation.method,
      citation.url,
    ].join("|");
    if (!dedup.has(key)) {
      dedup.set(key, citation);
    }
  });
  return [...dedup.values()];
};

const createSimplePdfBuffer = (title, lines) => {
  const normalizedLines = splitToPdfLines(lines);
  const pages = [];
  for (let i = 0; i < normalizedLines.length; i += LINES_PER_PAGE) {
    pages.push(normalizedLines.slice(i, i + LINES_PER_PAGE));
  }
  if (!pages.length) pages.push([]);

  const kids = pages.map((_, index) => `${4 + index * 2} 0 R`).join(" ");
  const objects = [];
  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
  objects.push(`2 0 obj << /Type /Pages /Kids [${kids}] /Count ${pages.length} >> endobj`);
  objects.push("3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj");

  pages.forEach((pageLines, pageIndex) => {
    const pageTitle =
      pages.length > 1 ? `${title} (pagina ${pageIndex + 1}/${pages.length})` : title;
    const contentLines = [
      "BT",
      "/F1 10 Tf",
      "50 800 Td",
      `(${escapePdfText(pageTitle)}) Tj`,
      "0 -16 Td",
    ];

    pageLines.forEach((line, index) => {
      contentLines.push(`(${escapePdfText(line)}) Tj`);
      if (index < pageLines.length - 1) {
        contentLines.push("0 -13 Td");
      }
    });
    contentLines.push("ET");

    const stream = contentLines.join("\n");
    const pageId = 4 + pageIndex * 2;
    const contentId = pageId + 1;

    objects.push(
      `${pageId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >> endobj`
    );
    objects.push(
      `${contentId} 0 obj << /Length ${Buffer.byteLength(stream, "utf8")} >> stream\n${stream}\nendstream endobj`
    );
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((obj) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${obj}\n`;
  });

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
};

const buildJsonReport = (run) => {
  return {
    runId: run.id,
    caseId: run.caseId,
    mode: run.mode,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMs: run.durationMs,
    caseSnapshot: run.caseSnapshot || null,
    executiveResult: run.executiveResult,
    evidencePack: run.evidencePack,
    roadmap: run.roadmap,
    traceability: run.evidencePack?.traceability || [],
  };
};

const buildPdfReport = (run) => {
  const result = run.executiveResult || {};
  const evidence = run.evidencePack || {};
  const rows = evidence.complianceMatrix || [];
  const contradictions = evidence.contradictions || [];
  const citations = collectCitations(run);
  const topContradiction = contradictions[0];
  const contradictionCitation = topContradiction?.citations?.[0]
    ? normalizeCitation(topContradiction.citations[0], "Contradiccion principal")
    : null;

  const lines = [
    "REPORTE EJECUTIVO + ANEXO LEGAL AUDITABLE",
    `Run: ${run.id}`,
    `Case: ${run.caseId}`,
    `Mode: ${run.mode}`,
    `Iniciado: ${formatIso(run.startedAt)}`,
    `Finalizado: ${formatIso(run.finishedAt)}`,
    `ICET: ${result.icet ?? "--"}`,
    `Decision: ${result.decision?.label || "--"}`,
    `Validez: ${result.validity?.label || "--"}`,
    `Exposure: ${result.exposureLevel || "--"}`,
    `Conclusive: ${result.conclusive ? "Yes" : "No (provisional)"}`,
    `Evidence Quality: ${result.evidenceQuality?.score ?? "--"}/100`,
    evidence.sourceCoverage
      ? `Regulatory coverage: ${evidence.sourceCoverage.healthySources}/${evidence.sourceCoverage.requiredThreshold}`
      : "Regulatory coverage: --",
    "",
    "1) INCOMPATIBILIDAD PRINCIPAL",
    topContradiction
      ? `[${topContradiction.severity}] ${topContradiction.type || "--"}: ${topContradiction.message || "--"}`
      : "Sin incompatibilidades principales detectadas.",
    topContradiction?.legalConflict ? `Conflicto legal: ${topContradiction.legalConflict}` : "Conflicto legal: --",
    contradictionCitation
      ? `Cita exacta: ${contradictionCitation.source} | art: ${contradictionCitation.article} | capa: ${contradictionCitation.layer} | fecha: ${contradictionCitation.date} | metodo: ${contradictionCitation.method}`
      : "Cita exacta: --",
    contradictionCitation?.url ? `URL: ${contradictionCitation.url}` : "URL: --",
    "",
    "2) MATRIZ DE CUMPLIMIENTO (resumen)",
    ...(rows.length
      ? rows.flatMap((row, index) => {
          const firstCitation = normalizeCitation(row.citations?.[0], `Matriz: ${row.requirement || "N/A"}`);
          return [
            `${index + 1}. ${row.requirement || "--"} | Estado: ${row.status || "--"} | Confianza: ${row.confidence || "--"}`,
            `   Base legal: ${row.legalBasis || "--"}`,
            `   Evidencia: ${truncate(row.evidence || "--", 220)}`,
            firstCitation
              ? `   Cita: ${firstCitation.source} | art: ${firstCitation.article} | capa: ${firstCitation.layer} | fecha: ${firstCitation.date} | metodo: ${firstCitation.method}`
              : "   Cita: --",
            firstCitation?.url ? `   URL: ${firstCitation.url}` : "",
          ].filter(Boolean);
        })
      : ["Sin matriz de cumplimiento."]),
    "",
    "3) CITAS VERIFICABLES (fuente + articulo + capa + fecha + metodo + url)",
    ...(citations.length
      ? citations.flatMap((citation, index) => {
          return [
            `${index + 1}. ${citation.origin}`,
            `   Fuente: ${citation.source}`,
            `   Articulo: ${citation.article}`,
            `   Capa: ${citation.layer}`,
            `   Fecha: ${citation.date}`,
            `   Metodo: ${citation.method}`,
            citation.url ? `   URL: ${citation.url}` : "   URL: --",
          ];
        })
      : ["Sin citas estructuradas en este run."]),
    "",
    "4) ESTADO DE FUENTES GEOREFERENCIADAS",
    ...((evidence.regulatorySources || []).length
      ? (evidence.regulatorySources || []).map((source, index) => {
          const error = source.error ? ` | error: ${truncate(source.error, 160)}` : "";
          return `${index + 1}. ${source.name} | estado: ${source.status || "--"} | matches: ${source.matchedCount ?? 0}${error}`;
        })
      : ["Sin detalle de fuentes georreferenciadas."]),
    "",
    "Top alerts:",
    ...(result.topAlerts || []).map((item, idx) => `${idx + 1}. [${item.severity}] ${item.type}: ${item.message}`),
    "",
    "Roadmap:",
    ...((run.roadmap?.actions || []).map((item, idx) => `${idx + 1}. ${item.priority} - ${item.title} (${item.timeline})`)),
    "",
    "Disclaimer: Este informe es soporte de due diligence. No reemplaza EIA oficial.",
  ];

  return createSimplePdfBuffer("Forensic Environmental Auditor v2", lines);
};

module.exports = {
  buildJsonReport,
  buildPdfReport,
};
