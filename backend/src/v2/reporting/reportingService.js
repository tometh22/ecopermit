const escapePdfText = (text) => String(text || "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const createSimplePdfBuffer = (title, lines) => {
  const contentLines = [
    "BT",
    "/F1 11 Tf",
    "50 790 Td",
    `(${escapePdfText(title)}) Tj`,
    "0 -18 Td",
  ];

  lines.forEach((line, index) => {
    contentLines.push(`(${escapePdfText(line)}) Tj`);
    if (index < lines.length - 1) {
      contentLines.push("0 -14 Td");
    }
  });
  contentLines.push("ET");

  const stream = contentLines.join("\n");

  const objects = [];
  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
  objects.push("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj");
  objects.push(
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj"
  );
  objects.push("4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj");
  objects.push(`5 0 obj << /Length ${Buffer.byteLength(stream, "utf8")} >> stream\n${stream}\nendstream endobj`);

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
  const lines = [
    `Run: ${run.id}`,
    `Case: ${run.caseId}`,
    `Mode: ${run.mode}`,
    `ICET: ${result.icet ?? "--"}`,
    `Decision: ${result.decision?.label || "--"}`,
    `Exposure: ${result.exposureLevel || "--"}`,
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
