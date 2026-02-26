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

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5050);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "2mb" }));
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
  } catch (error) {
    return null;
  }
};

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

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

    const providedText = typeof req.body.documentText === "string" ? req.body.documentText : "";
    let fileText = providedText.trim();
    if (req.file?.path) {
      try {
        if (!fileText && req.file.mimetype === "application/pdf") {
          const buffer = fs.readFileSync(req.file.path);
          const parsed = await pdfParse(buffer);
          fileText = parsed.text || "";
        } else if (!fileText && req.file.mimetype === "text/plain") {
          fileText = fs.readFileSync(req.file.path, "utf-8");
        }
      } catch (error) {
        fileText = fileText || "";
      }
    }

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
      fileText: fileText.slice(0, 12000),
    });

    res.status(201).json({ project });
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects", (_req, res) => {
  res.json({ projects: listProjects() });
});

app.get("/api/projects/:id", (req, res) => {
  const project = getProject(req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json({ project });
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

    res.status(201).json({ audit });
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
  res.json({ audit });
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

app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message || "Bad request" });
});

app.listen(PORT, () => {
  console.log(`Backend listening on :${PORT}`);
});
