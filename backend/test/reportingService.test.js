const test = require("node:test");
const assert = require("node:assert/strict");

const { buildJsonReport, buildPdfReport } = require("../src/v2/reporting/reportingService");

test("buildJsonReport keeps run metadata and traceability", () => {
  const run = {
    id: "run-1",
    caseId: "case-1",
    mode: "EIA_QA",
    status: "completed",
    startedAt: "2026-03-10T00:00:00.000Z",
    finishedAt: "2026-03-10T00:00:10.000Z",
    durationMs: 10000,
    executiveResult: { icet: 70 },
    evidencePack: { traceability: [{ source: "IGN" }] },
    roadmap: { actions: [] },
  };

  const report = buildJsonReport(run);
  assert.equal(report.runId, "run-1");
  assert.equal(report.caseId, "case-1");
  assert.equal(report.traceability.length, 1);
  assert.equal(report.traceability[0].source, "IGN");
});

test("buildPdfReport includes legal annex citations", () => {
  const run = {
    id: "run-2",
    caseId: "case-2",
    mode: "EIA_QA",
    status: "completed",
    startedAt: "2026-03-10T00:00:00.000Z",
    finishedAt: "2026-03-10T00:00:30.000Z",
    executiveResult: {
      icet: 81,
      decision: { label: "No recomendado" },
      conclusive: true,
      topAlerts: [{ severity: "Bloqueante", type: "Hidrico", message: "Conflicto critico." }],
    },
    evidencePack: {
      sourceCoverage: { healthySources: 6, requiredThreshold: 2 },
      complianceMatrix: [
        {
          requirement: "Integridad de declaracion",
          legalBasis: "Ley 12.257",
          evidence: "Contradiccion critica detectada",
          status: "No cumple",
          confidence: "Alta",
          citations: [
            {
              source: "Ley 12.257",
              article: "Art. 1",
              layer: "hidrografia_oficial",
              date: "2026-03-10T00:00:00.000Z",
              method: "Regulatory RAG",
              url: "https://example.org/law-12257",
            },
          ],
        },
      ],
      contradictions: [
        {
          type: "Hidrico",
          severity: "Bloqueante",
          message: "Claim incompatible con descarga",
          legalConflict: "Permiso de vuelco pendiente",
          citations: [
            {
              source: "Ley 5965",
              article: "Art. 2",
              layer: "efluentes",
              date: "2026-03-10T00:00:00.000Z",
              method: "Consistency Auditor",
              url: "https://example.org/law-5965",
            },
          ],
        },
      ],
      regulatorySources: [
        {
          name: "IGN - Hidrografia areal",
          status: "ok",
          matchedCount: 1,
        },
      ],
    },
    roadmap: {
      actions: [{ priority: "P1", title: "Corregir capitulo hidrico", timeline: "2-4 semanas" }],
    },
  };

  const pdf = buildPdfReport(run);
  const pdfText = pdf.toString("utf8");

  assert.ok(pdfText.includes("ANEXO LEGAL AUDITABLE"));
  assert.ok(pdfText.includes("CITAS VERIFICABLES"));
  assert.ok(pdfText.includes("Ley 5965"));
  assert.ok(pdfText.includes("https://example.org/law-12257"));
});
