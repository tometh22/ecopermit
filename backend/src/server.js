const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const dotenv = require("dotenv");
const pdfParse = require("pdf-parse");

const { createProject, listProjects, getProject, createAudit, getAudit } = require("./storage");
const { runAudit } = require("./auditEngine");
const { fetchEnvironmentalContext } = require("./contextService");
const { fetchTerritorialSignals } = require("./territorialService");
const { fetchPlanetSignals } = require("./planetService");
const { fetchPlanetProcessingSignals } = require("./planetProcessingService");

const { getStore } = require("./v2/persistence/store");
const { runCaseAnalysis, ensureMode } = require("./v2/orchestrator/runOrchestrator");
const { buildJsonReport, buildPdfReport } = require("./v2/reporting/reportingService");
const { getSourceRegistry, getRegistryConfig } = require("./v2/regulatory/sourceRegistry");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5050);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const OCR_MODE = (process.env.OCR_MODE || "auto").toLowerCase();
const OCR_MIN_TEXT_CHARS = Number(process.env.OCR_MIN_TEXT_CHARS || 500);

const DEPRECATION_DATE = process.env.LEGACY_API_DEPRECATION_DATE || "2026-06-30";

let cachedOcrService = null;
const loadOcrService = () => {
  if (cachedOcrService) {
    return cachedOcrService;
  }
  try {
    cachedOcrService = { ...require("./ocrService"), error: null };
  } catch (error) {
    cachedOcrService = { extractTextWithOcr: null, error };
  }
  return cachedOcrService;
};

const addDays = (base, days) => {
  const next = new Date(base.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const frequencyToNextRun = (frequency) => {
  const now = new Date();
  if (frequency === "hourly") {
    now.setUTCHours(now.getUTCHours() + 1);
    return now.toISOString();
  }
  if (frequency === "daily") {
    return addDays(now, 1).toISOString();
  }
  return addDays(now, 7).toISOString();
};

const isProd = process.env.NODE_ENV === "production";
const validateConfig = () => {
  const warnings = [];

  if (isProd && CORS_ORIGIN === "*") {
    warnings.push("CORS_ORIGIN is '*'. Restrict this in production.");
  }
  if (!process.env.OPENAI_API_KEY) {
    warnings.push("OPENAI_API_KEY missing: GPT enrichment disabled.");
  }
  if (!process.env.GOOGLE_ENV_API_KEY) {
    warnings.push("GOOGLE_ENV_API_KEY missing: Air/Weather context disabled.");
  }
  if (!process.env.PLANET_API_KEY) {
    warnings.push("PLANET_API_KEY missing: Planet Data API disabled.");
  }

  const sources = getSourceRegistry();
  const criticalSources = sources.filter((item) => item.critical);
  const configuredCritical = criticalSources.filter((item) => item.url || item.kind === "inline_geojson");
  if (!configuredCritical.length) {
    warnings.push(
      "No critical regulatory georeferenced sources configured. Results may be marked as 'No concluyente'."
    );
  }

  warnings.forEach((msg) => console.warn(`[config-warning] ${msg}`));
};

validateConfig();

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "4mb" }));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

const upload = multer({
  dest: path.join(__dirname, "..", "uploads"),
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "text/plain"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Only PDF or TXT files are allowed."));
  },
});

const parseCoordinates = (lat, lng) => {
  if (lat === undefined || lng === undefined || lat === "" || lng === "") {
    return null;
  }
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
    return null;
  }
  return { lat: latNum, lng: lngNum };
};

const parseBoundary = (boundary) => {
  if (!boundary) {
    return null;
  }
  if (typeof boundary === "object") {
    return boundary;
  }
  try {
    return JSON.parse(boundary);
  } catch (_error) {
    return null;
  }
};

const parseMetadata = (metadata) => {
  if (!metadata) {
    return {};
  }
  if (typeof metadata === "object") {
    return metadata;
  }
  try {
    return JSON.parse(metadata);
  } catch (_error) {
    return {};
  }
};

const extractUploadedText = async (reqFile, providedText = "") => {
  let fileText = (providedText || "").trim();
  let pdfBuffer = null;

  if (reqFile?.path) {
    try {
      if (!fileText && reqFile.mimetype === "application/pdf") {
        pdfBuffer = fs.readFileSync(reqFile.path);
        const parsed = await pdfParse(pdfBuffer);
        fileText = parsed.text || "";
      } else if (!fileText && reqFile.mimetype === "text/plain") {
        fileText = fs.readFileSync(reqFile.path, "utf-8");
      }
    } catch (_error) {
      fileText = fileText || "";
    }
  }

  if (!fileText && reqFile?.mimetype === "application/pdf" && OCR_MODE !== "disabled") {
    try {
      if (!pdfBuffer && reqFile?.path) {
        pdfBuffer = fs.readFileSync(reqFile.path);
      }
      if (pdfBuffer) {
        const ocrService = loadOcrService();
        if (ocrService.error || !ocrService.extractTextWithOcr) {
          throw new Error(`OCR dependencies missing: ${ocrService.error?.message || "unknown"}`);
        }
        const ocrResult = await ocrService.extractTextWithOcr(pdfBuffer);
        fileText = ocrResult.text || "";
      }
    } catch (_error) {
      fileText = "";
    }
  }

  if (
    fileText
    && reqFile?.mimetype === "application/pdf"
    && OCR_MODE !== "disabled"
    && fileText.trim().length < OCR_MIN_TEXT_CHARS
  ) {
    try {
      if (!pdfBuffer && reqFile?.path) {
        pdfBuffer = fs.readFileSync(reqFile.path);
      }
      if (pdfBuffer) {
        const ocrService = loadOcrService();
        if (ocrService.error || !ocrService.extractTextWithOcr) {
          throw new Error(`OCR dependencies missing: ${ocrService.error?.message || "unknown"}`);
        }
        const ocrResult = await ocrService.extractTextWithOcr(pdfBuffer);
        if (ocrResult.text && ocrResult.text.trim().length > fileText.trim().length) {
          fileText = ocrResult.text;
        }
      }
    } catch (_error) {
      // Keep previous extraction
    }
  }

  return String(fileText || "").slice(0, 120000);
};

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", version: "v1" });
});

app.get("/api/v2/health", (_req, res) => {
  res.json({ status: "ok", version: "v2" });
});

app.get("/api/v2/regulatory/sources", (_req, res) => {
  const sources = getSourceRegistry().map((source) => ({
    id: source.id,
    name: source.name,
    authority: source.authority,
    jurisdiction: source.jurisdiction,
    type: source.type,
    legalRef: source.legalRef,
    citationUrl: source.citationUrl || source.url || "",
    kind: source.kind,
    critical: source.critical,
    configured: Boolean(source.url || source.data),
  }));
  const config = getRegistryConfig();
  res.json({
    sources,
    config,
  });
});

// ---------------------------------------------------------------------------
// Legacy v1 API (compat layer)
// ---------------------------------------------------------------------------

app.post("/api/projects", upload.single("file"), async (req, res, next) => {
  try {
    const coordinates = parseCoordinates(req.body.lat, req.body.lng);
    const boundary = parseBoundary(req.body.boundary);
    const file = req.file
      ? {
          filename: req.file.filename,
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
        }
      : null;

    const fileText = await extractUploadedText(req.file, req.body.documentText);

    const project = createProject({
      caseId: req.body.caseId,
      name: req.body.name,
      industry: req.body.industry,
      scenario: req.body.scenario,
      coordinates,
      boundary,
      claims: req.body.claims,
      specs: req.body.specs,
      file,
      fileText,
    });

    res.status(201).json({
      project,
      meta: {
        warning: "Legacy endpoint. Migrate to /api/v2/cases before deprecation.",
        deprecatesAt: DEPRECATION_DATE,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects", (_req, res) => {
  res.json({
    projects: listProjects(),
    meta: {
      warning: "Legacy endpoint. Migrate to /api/v2/cases.",
      deprecatesAt: DEPRECATION_DATE,
    },
  });
});

app.get("/api/projects/:id", (req, res) => {
  const project = getProject(req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json({
    project,
    meta: {
      warning: "Legacy endpoint. Migrate to /api/v2/cases/:id.",
      deprecatesAt: DEPRECATION_DATE,
    },
  });
});

app.post("/api/audits", async (req, res, next) => {
  try {
    let project = null;
    if (req.body.projectId) {
      project = getProject(req.body.projectId);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
    }

    const coordinates = project?.coordinates || parseCoordinates(req.body.lat, req.body.lng);
    const projectName = project?.name || req.body.projectName || "";
    const industry = project?.industry || req.body.industry || "";
    const scenario = project?.scenario || req.body.scenario || "";
    const claims = project?.claims || req.body.claims || "";
    const specs = project?.specs || req.body.specs || "";
    const uploadedFileName = project?.file?.originalName || "";
    const caseId = project?.caseId || req.body.caseId || "";
    const boundary = project?.boundary || parseBoundary(req.body.boundary);
    const documentText = project?.fileText || req.body.documentText || "";

    const environment = await fetchEnvironmentalContext(coordinates);
    const territorialSignals = await fetchTerritorialSignals({ coordinates, boundary });
    const planetSignals = await fetchPlanetSignals({ coordinates, boundary });
    const planetProcessingSignals = await fetchPlanetProcessingSignals({ coordinates, boundary });

    const { analysis, logs } = await runAudit({
      projectName,
      industry,
      scenario,
      claims,
      specs,
      coordinates,
      boundary,
      documentText,
      uploadedFileName,
      environment,
      territorialSignals,
      planetSignals,
      planetProcessingSignals,
      contextRiskAdjustment: environment?.riskAdjustment ?? 0,
      caseId,
    });

    const audit = createAudit({
      projectId: project?.id || null,
      analysis,
      logs,
    });

    res.status(201).json({
      audit,
      meta: {
        warning: "Legacy endpoint. Migrate to /api/v2/cases/:id/runs.",
        deprecatesAt: DEPRECATION_DATE,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/audits/:id", (req, res) => {
  const audit = getAudit(req.params.id);
  if (!audit) {
    res.status(404).json({ error: "Audit not found" });
    return;
  }
  res.json({
    audit,
    meta: {
      warning: "Legacy endpoint. Migrate to /api/v2/runs/:id.",
      deprecatesAt: DEPRECATION_DATE,
    },
  });
});

app.get("/api/audits/:id/stream", (req, res) => {
  const audit = getAudit(req.params.id);
  if (!audit) {
    res.status(404).json({ error: "Audit not found" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  let index = 0;
  const interval = setInterval(() => {
    if (index >= audit.logs.length) {
      res.write("event: done\ndata: {}\n\n");
      clearInterval(interval);
      res.end();
      return;
    }

    res.write(`event: log\ndata: ${JSON.stringify(audit.logs[index])}\n\n`);
    index += 1;
  }, 420);

  req.on("close", () => {
    clearInterval(interval);
  });
});

// ---------------------------------------------------------------------------
// v2 API
// ---------------------------------------------------------------------------

app.post("/api/v2/cases", upload.single("file"), async (req, res, next) => {
  try {
    const store = await getStore();

    const coordinates = parseCoordinates(req.body.lat, req.body.lng);
    const boundaryGeoJSON = parseBoundary(req.body.boundary);
    const metadata = parseMetadata(req.body.metadata);
    const studyText = await extractUploadedText(req.file, req.body.documentText);

    const created = await store.createCase({
      name: req.body.name || "",
      projectType: req.body.projectType || req.body.industry || "Inmobiliario",
      modeDefaults: { primary: ensureMode(req.body.mode || "PRE_EIA") },
      location: {
        coordinates,
        areaM2: Number(req.body.areaM2) || null,
      },
      boundaryGeoJSON,
      metadata,
      claims: req.body.claims || "",
      specs: req.body.specs || "",
      documents: {
        studyFileName: req.file?.originalname || "",
        studyMimeType: req.file?.mimetype || "",
        studyText,
      },
    });

    res.status(201).json({ case: created });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v2/cases", async (_req, res, next) => {
  try {
    const store = await getStore();
    const cases = await store.listCases();
    res.json({ cases });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v2/cases/:id", async (req, res, next) => {
  try {
    const store = await getStore();
    const caseRecord = await store.getCase(req.params.id);
    if (!caseRecord) {
      res.status(404).json({ error: "Case not found" });
      return;
    }

    const runs = await store.listRunsByCase(caseRecord.id);
    const monitoring = await store.getMonitoring(caseRecord.id);

    res.json({
      case: caseRecord,
      runs,
      monitoring,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v2/cases/:id/runs", async (req, res, next) => {
  try {
    const store = await getStore();
    const caseRecord = await store.getCase(req.params.id);

    if (!caseRecord) {
      res.status(404).json({ error: "Case not found" });
      return;
    }

    const patch = {
      claims: req.body.claims ?? caseRecord.claims,
      specs: req.body.specs ?? caseRecord.specs,
      modeDefaults: { primary: ensureMode(req.body.mode || caseRecord.modeDefaults?.primary || "PRE_EIA") },
      location: {
        ...(caseRecord.location || {}),
        coordinates: parseCoordinates(req.body.lat, req.body.lng) || caseRecord.location?.coordinates || null,
      },
      boundaryGeoJSON: parseBoundary(req.body.boundary) || caseRecord.boundaryGeoJSON || null,
      documents: {
        ...(caseRecord.documents || {}),
        studyText: req.body.documentText || caseRecord.documents?.studyText || "",
      },
    };

    const updatedCase = await store.updateCase(caseRecord.id, patch);
    const previousRuns = await store.listRunsByCase(updatedCase.id);
    const previousIcet = Number(previousRuns?.[0]?.executiveResult?.icet);
    const monitoring = await store.getMonitoring(updatedCase.id);

    const startedAt = Date.now();
    const result = await runCaseAnalysis({
      caseData: updatedCase,
      mode: req.body.mode || updatedCase.modeDefaults?.primary || "PRE_EIA",
    });
    const finishedAt = Date.now();
    const currentIcet = Number(result.executiveResult?.icet);
    const deltaIcet = Number.isFinite(previousIcet) && Number.isFinite(currentIcet)
      ? currentIcet - previousIcet
      : null;

    if (
      result.mode === "LIVING_EIA"
      && monitoring?.enabled
      && Number.isFinite(deltaIcet)
      && Math.abs(deltaIcet) >= (monitoring.thresholdDeltaIcet || 8)
    ) {
      result.executiveResult.topAlerts = [
        {
          type: "Monitoreo",
          severity: "Alta",
          message: `Delta ICET de ${deltaIcet > 0 ? "+" : ""}${deltaIcet} puntos vs corrida previa.`,
        },
        ...(result.executiveResult.topAlerts || []),
      ].slice(0, 5);

      result.logs.push({
        agent: "Monitoring_Scheduler",
        message: `Umbral de monitoreo superado (delta ICET ${deltaIcet > 0 ? "+" : ""}${deltaIcet}).`,
        timestamp: new Date().toISOString(),
      });
    }

    const run = await store.createRun({
      caseId: updatedCase.id,
      mode: result.mode,
      status: "completed",
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - startedAt,
      executiveResult: result.executiveResult,
      evidencePack: result.evidencePack,
      roadmap: result.roadmap,
      kpis: {
        ...result.kpis,
        timeToFirstDecisionSeconds: Math.round((finishedAt - startedAt) / 1000),
        deltaIcet,
      },
      logs: result.logs,
      caseSnapshot: {
        id: updatedCase.id,
        name: updatedCase.name,
        location: updatedCase.location,
        boundaryGeoJSON: updatedCase.boundaryGeoJSON,
      },
    });

    res.status(201).json({ run });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v2/runs/:id", async (req, res, next) => {
  try {
    const store = await getStore();
    const run = await store.getRun(req.params.id);
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    res.json({ run });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v2/runs/:id/stream", async (req, res, next) => {
  try {
    const store = await getStore();
    const run = await store.getRun(req.params.id);
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    let index = 0;
    const entries = Array.isArray(run.logs) ? run.logs : [];
    const interval = setInterval(() => {
      if (index >= entries.length) {
        res.write("event: done\ndata: {}\n\n");
        clearInterval(interval);
        res.end();
        return;
      }

      res.write(`event: log\ndata: ${JSON.stringify(entries[index])}\n\n`);
      index += 1;
    }, 350);

    req.on("close", () => {
      clearInterval(interval);
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v2/runs/:id/report", async (req, res, next) => {
  try {
    const format = String(req.query.format || "json").toLowerCase();
    const store = await getStore();
    const run = await store.getRun(req.params.id);

    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    if (format === "pdf") {
      const buffer = buildPdfReport(run);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="run-${run.id}.pdf"`);
      res.send(buffer);
      return;
    }

    res.json({ report: buildJsonReport(run) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v2/cases/:id/monitoring", async (req, res, next) => {
  try {
    const store = await getStore();
    const caseRecord = await store.getCase(req.params.id);

    if (!caseRecord) {
      res.status(404).json({ error: "Case not found" });
      return;
    }

    const frequency = ["hourly", "daily", "weekly"].includes(req.body.frequency)
      ? req.body.frequency
      : "weekly";

    const current = await store.getMonitoring(caseRecord.id);
    const monitoring = await store.setMonitoring(caseRecord.id, {
      enabled: req.body.enabled !== false,
      frequency,
      thresholdDeltaIcet: Number(req.body.thresholdDeltaIcet),
      nextRunAt: req.body.nextRunAt || current?.nextRunAt || frequencyToNextRun(frequency),
      lastRunAt: current?.lastRunAt || null,
    });

    res.status(201).json({ monitoring });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v2/cases/:id/monitoring", async (req, res, next) => {
  try {
    const store = await getStore();
    const monitoring = await store.getMonitoring(req.params.id);
    if (!monitoring) {
      res.status(404).json({ error: "Monitoring not configured" });
      return;
    }
    res.json({ monitoring });
  } catch (error) {
    next(error);
  }
});

app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message || "Bad request" });
});

app.listen(PORT, () => {
  console.log(`Backend listening on :${PORT}`);
});
