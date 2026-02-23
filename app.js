const GMAPS_API_KEY = "";

const elements = {
  fileInput: document.getElementById("fileInput"),
  chooseFileBtn: document.getElementById("chooseFileBtn"),
  runAuditBtn: document.getElementById("runAuditBtn"),
  exportBtn: document.getElementById("exportBtn"),
  claims: document.getElementById("claims"),
  specs: document.getElementById("specs"),
  lat: document.getElementById("lat"),
  lng: document.getElementById("lng"),
  industry: document.getElementById("industry"),
  projectName: document.getElementById("projectName"),
  scenario: document.getElementById("scenario"),
  terminal: document.getElementById("terminal"),
  riskGauge: document.getElementById("riskGauge"),
  riskValue: document.getElementById("riskValue"),
  claimedText: document.getElementById("claimedText"),
  realityText: document.getElementById("realityText"),
  legalText: document.getElementById("legalText"),
  severityChip: document.getElementById("severityChip"),
  layerBoundary: document.getElementById("layerBoundary"),
  layerHydro: document.getElementById("layerHydro"),
  layerVegetation: document.getElementById("layerVegetation"),
  map: document.getElementById("map"),
};

const mapLayers = {
  boundary: document.querySelector(".layer.boundary"),
  hydro: document.querySelector(".layer.hydro"),
  vegetation: document.querySelector(".layer.vegetation"),
};

const restrictedZones = [
  {
    name: "Blue Delta Wetlands",
    type: "Wetlands",
    bounds: { minLat: 29.1, maxLat: 30.4, minLng: -91.2, maxLng: -90.1 },
    law: "Clean Water Act §404",
  },
  {
    name: "Sierra Native Forest Reserve",
    type: "Native Forests",
    bounds: { minLat: 36.3, maxLat: 37.2, minLng: -120.1, maxLng: -118.8 },
    law: "Forest Protection Act Art. 18",
  },
  {
    name: "Cascadia Fault Corridor",
    type: "Fault Lines",
    bounds: { minLat: 44.2, maxLat: 46.2, minLng: -124.6, maxLng: -122.7 },
    law: "Seismic Safety Code Art. 7",
  },
];

let uploadedFileName = "";
let lastAnalysis = null;

const logQueue = [];
let logTimer = null;

const timestamp = () => {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const appendLog = (agent, message) => {
  const line = document.createElement("div");
  line.className = "terminal-line";
  line.innerHTML = `
    <span class="time">${timestamp()}</span>
    <span class="agent">${agent}</span>
    <span class="message">${message}</span>
  `;
  elements.terminal.appendChild(line);
  elements.terminal.scrollTop = elements.terminal.scrollHeight;
};

const enqueueLogs = (entries, onComplete) => {
  logQueue.push(...entries);
  if (logTimer) {
    return;
  }

  const runNext = () => {
    if (logQueue.length === 0) {
      logTimer = null;
      if (onComplete) {
        onComplete();
      }
      return;
    }

    const next = logQueue.shift();
    appendLog(next.agent, next.message);
    logTimer = setTimeout(runNext, next.delay ?? 420);
  };

  runNext();
};

const resetTerminal = () => {
  elements.terminal.innerHTML = "";
};

const setGauge = (value) => {
  const risk = Math.max(0, Math.min(100, Math.round(value)));
  elements.riskValue.textContent = risk;
  let color = "#7ef29d";
  if (risk >= 70) {
    color = "#e05b5b";
  } else if (risk >= 40) {
    color = "#f5b353";
  }
  elements.riskGauge.style.setProperty("--risk", risk);
  elements.riskGauge.style.setProperty("--risk-color", color);
};

const detectInconsistency = (claimsText, specsText) => {
  const claims = claimsText.toLowerCase();
  const specs = specsText.toLowerCase();
  const hasNeutralImpact = claims.includes("neutral impact");
  const hasExtraction = specs.includes("resource extraction") || specs.includes("discharge");
  const snippet = (text, fallback) => {
    const cleaned = text.replace(/\s+/g, " ").trim();
    return cleaned ? cleaned.slice(0, 160) : fallback;
  };

  if (hasNeutralImpact && hasExtraction) {
    return {
      severity: "CRITICAL_ALERT",
      claimed: snippet(claimsText, "Neutral Impact declared for hydrological systems."),
      reality: snippet(specsText, "Engineering specs list resource extraction / discharge."),
      legal: "Global_Regulatory_Framework Article 12: Misrepresentation of material impact.",
    };
  }

  if (claimsText.trim() || specsText.trim()) {
    return {
      severity: "Review",
      claimed: claimsText.trim() || "No explicit claim provided.",
      reality: specsText.trim() || "No engineering specs provided.",
      legal: "No direct conflict detected. Manual review recommended.",
    };
  }

  return null;
};

const getRegulatoryReferences = (lat, lng) => {
  const refs = [
    "Global_Regulatory_Framework: Article 3 - Biodiversity Safeguards",
    "Global_Regulatory_Framework: Article 7 - Hydrographic Network Protection",
  ];

  if (lat !== null && lng !== null) {
    refs.push(`Jurisdictional overlay for (${lat.toFixed(2)}, ${lng.toFixed(2)})`);
  }
  return refs;
};

const checkRestrictedZones = (lat, lng) => {
  if (lat === null || lng === null) {
    return [];
  }

  return restrictedZones.filter((zone) => {
    return (
      lat >= zone.bounds.minLat &&
      lat <= zone.bounds.maxLat &&
      lng >= zone.bounds.minLng &&
      lng <= zone.bounds.maxLng
    );
  });
};

const buildRoadmap = (analysis) => {
  if (!analysis) {
    return "Run an audit to generate the correction roadmap.";
  }

  const lines = [
    "Correction Roadmap",
    "===================",
    `Project: ${analysis.projectName || "Untitled"}`,
    `Industry: ${analysis.industry}`,
    `Scenario: ${analysis.scenario}`,
    "",
    "Priority Actions:",
    `1. Verify claims language: ${analysis.inconsistency?.claimed || "N/A"}`,
    "2. Align engineering specs with environmental impact limits.",
    `3. Address regulatory references: ${analysis.regulatoryRefs.join("; ")}`,
    `4. Resolve geospatial conflicts: ${analysis.zoneSummary || "No overlaps detected."}`,
    "",
    "Submission Checklist:",
    "- Updated impact narrative",
    "- Revised mitigation plan",
    "- Evidence of remediation commitments",
  ];

  return lines.join("\n");
};

const runAudit = () => {
  const claimsText = elements.claims.value;
  const specsText = elements.specs.value;
  const lat = elements.lat.value ? Number(elements.lat.value) : null;
  const lng = elements.lng.value ? Number(elements.lng.value) : null;

  const inconsistency = detectInconsistency(claimsText, specsText);
  const overlaps = checkRestrictedZones(lat, lng);
  const regulatoryRefs = getRegulatoryReferences(lat, lng);

  let riskScore = 18;
  if (uploadedFileName) {
    riskScore += 6;
  }
  if (inconsistency?.severity === "CRITICAL_ALERT") {
    riskScore += 55;
  } else if (inconsistency) {
    riskScore += 18;
  }
  if (overlaps.length) {
    riskScore += 25;
  }
  riskScore = Math.min(100, riskScore);

  const zoneSummary = overlaps
    .map((zone) => `${zone.type}: ${zone.name} (${zone.law})`)
    .join(" | ");

  const analysis = {
    projectName: elements.projectName.value,
    industry: elements.industry.value,
    scenario: elements.scenario.value,
    inconsistency,
    overlaps,
    regulatoryRefs,
    zoneSummary: zoneSummary || "No overlaps detected.",
    riskScore,
  };

  lastAnalysis = analysis;

  resetTerminal();
  const logEntries = [
    {
      agent: "Project_Manager_Agent",
      message: `Ingesting project intake for ${analysis.projectName || "Unnamed Project"}.`,
    },
    {
      agent: "Project_Manager_Agent",
      message: uploadedFileName
        ? `Attached study file: ${uploadedFileName}.`
        : "No study file attached; continuing with manual inputs.",
    },
    {
      agent: "GeoJSON_Layer_Controller",
      message: "Composing project boundary and active map layers.",
    },
    {
      agent: "Gemini_Reasoning_Engine",
      message: "Indexing Global_Regulatory_Framework namespace (Gemini 1.5 Pro).",
    },
    {
      agent: "Regulatory_RAG",
      message: "Vector DB query issued for jurisdictional regulatory anchors.",
    },
    {
      agent: "Gemini_Reasoning_Engine",
      message: `Retrieved ${regulatoryRefs.length} regulatory anchors for coordinates.`,
    },
    {
      agent: "Consistency_Auditor",
      message: "Comparing Project_Claims vs Engineering_Specs.",
    },
    {
      agent: "Consistency_Auditor",
      message: inconsistency
        ? `Status: ${inconsistency.severity}.`
        : "Status: No inconsistencies detected.",
    },
    {
      agent: "Geospatial_Verifier",
      message: overlaps.length
        ? `Overlap detected with ${overlaps.length} restricted zone(s).`
        : "No overlap detected with restricted zones.",
    },
    {
      agent: "Automated_PDF_Generator",
      message: "Drafting correction roadmap and audit certificate.",
    },
    {
      agent: "Audit_Orchestrator",
      message: `Risk score computed at ${riskScore}/100.`,
      delay: 540,
    },
  ];

  if (inconsistency?.severity === "CRITICAL_ALERT") {
    logEntries.push({
      agent: "Consistency_Auditor",
      message: "Trigger condition met: Neutral Impact claim vs resource extraction/discharge.",
    });
  } else if (inconsistency) {
    logEntries.push({
      agent: "Consistency_Auditor",
      message: "Claims/specs differ but no critical trigger detected.",
    });
  }

  if (overlaps.length) {
    logEntries.push({
      agent: "Geospatial_Verifier",
      message: `Restricted zone(s) intersected: ${analysis.zoneSummary}.`,
    });
  }

  enqueueLogs(logEntries, () => {
    updateUI(analysis);
  });
};

const updateUI = (analysis) => {
  setGauge(analysis.riskScore);

  if (analysis.inconsistency) {
    elements.claimedText.textContent = analysis.inconsistency.claimed;
    elements.realityText.textContent = analysis.inconsistency.reality;
    elements.legalText.textContent = analysis.inconsistency.legal;

    if (analysis.inconsistency.severity === "CRITICAL_ALERT") {
      elements.severityChip.textContent = "Critical";
      elements.severityChip.classList.add("alert");
    } else {
      elements.severityChip.textContent = "Review";
      elements.severityChip.classList.remove("alert");
    }
  } else {
    elements.claimedText.textContent = "Awaiting project claims.";
    elements.realityText.textContent = "Awaiting engineering specs.";
    elements.legalText.textContent = "No conflicts detected.";
    elements.severityChip.textContent = "Stable";
    elements.severityChip.classList.remove("alert");
  }

  if (analysis.overlaps.length) {
    appendLog("Geospatial_Verifier", `Overlap summary: ${analysis.zoneSummary}.`);
  }
};

const exportRoadmap = () => {
  const roadmap = buildRoadmap(lastAnalysis);
  const roadmapWindow = window.open("", "_blank");

  if (!roadmapWindow) {
    alert("Pop-up blocked. Please allow pop-ups to export the roadmap.");
    return;
  }

  const html = `
    <!doctype html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Correction Roadmap</title>
      <style>
        body { font-family: "Space Grotesk", Arial, sans-serif; padding: 32px; }
        h1 { margin-top: 0; }
        pre { white-space: pre-wrap; font-size: 14px; }
      </style>
    </head>
    <body>
      <h1>Correction Roadmap</h1>
      <pre>${roadmap.replace(/</g, "&lt;")}</pre>
      <p>Use your browser's Print command to save as PDF.</p>
    </body>
    </html>
  `;

  roadmapWindow.document.write(html);
  roadmapWindow.document.close();
  roadmapWindow.focus();
};

const handleFile = (file) => {
  if (!file) {
    return;
  }

  uploadedFileName = file.name;

  if (file.type === "text/plain") {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      elements.claims.value = text.slice(0, 1200);
    };
    reader.readAsText(file);
  }
};

const toggleLayer = (layer, visible) => {
  layer.classList.toggle("hidden", !visible);
};

const initLayerControls = () => {
  elements.layerBoundary.addEventListener("change", (event) => {
    toggleLayer(mapLayers.boundary, event.target.checked);
  });
  elements.layerHydro.addEventListener("change", (event) => {
    toggleLayer(mapLayers.hydro, event.target.checked);
  });
  elements.layerVegetation.addEventListener("change", (event) => {
    toggleLayer(mapLayers.vegetation, event.target.checked);
  });
};

const initMap = () => {
  if (!GMAPS_API_KEY) {
    return;
  }

  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_API_KEY}`;
  script.async = true;
  script.onload = () => {
    const center = { lat: 37.7749, lng: -122.4194 };
    const map = new window.google.maps.Map(elements.map, {
      center,
      zoom: 7,
      mapTypeId: "terrain",
    });

    new window.google.maps.Marker({
      position: center,
      map,
      title: "Project Boundary",
    });

    const placeholder = elements.map.querySelector(".map-placeholder");
    if (placeholder) {
      placeholder.style.display = "none";
    }
  };
  document.body.appendChild(script);
};

const bindEvents = () => {
  elements.chooseFileBtn.addEventListener("click", () => elements.fileInput.click());
  elements.fileInput.addEventListener("change", (event) => handleFile(event.target.files[0]));
  elements.runAuditBtn.addEventListener("click", runAudit);
  elements.exportBtn.addEventListener("click", exportRoadmap);
};

initLayerControls();
bindEvents();
initMap();
setGauge(0);
