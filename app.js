const resolveMapsKey = () => {
  const params = new URLSearchParams(window.location.search);
  const param = params.get("maps_key");
  if (param) {
    localStorage.setItem("GMAPS_API_KEY", param);
    return param;
  }
  return localStorage.getItem("GMAPS_API_KEY") || "";
};

const GMAPS_API_KEY = resolveMapsKey();

const resolveApiBaseUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const param = params.get("api");
  if (param) {
    localStorage.setItem("API_BASE_URL", param);
    return param;
  }
  return localStorage.getItem("API_BASE_URL") || "http://localhost:5050";
};

const API_BASE_URL = resolveApiBaseUrl().replace(/\/$/, "");

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
  summaryStatus: document.getElementById("summaryStatus"),
  layerBoundary: document.getElementById("layerBoundary"),
  layerHydro: document.getElementById("layerHydro"),
  layerVegetation: document.getElementById("layerVegetation"),
  map: document.getElementById("map"),
  kpiRisk: document.getElementById("kpiRisk"),
  kpiAlerts: document.getElementById("kpiAlerts"),
  kpiAnchors: document.getElementById("kpiAnchors"),
  kpiOverlaps: document.getElementById("kpiOverlaps"),
  envAqi: document.getElementById("envAqi"),
  envAqiCategory: document.getElementById("envAqiCategory"),
  envPm25: document.getElementById("envPm25"),
  envPm25Units: document.getElementById("envPm25Units"),
  envTemp: document.getElementById("envTemp"),
  envFeelsLike: document.getElementById("envFeelsLike"),
  envHumidity: document.getElementById("envHumidity"),
  envCondition: document.getElementById("envCondition"),
  envNote: document.getElementById("envNote"),
};

const mapLayers = {
  boundary: document.querySelector(".layer.boundary"),
  hydro: document.querySelector(".layer.hydro"),
  vegetation: document.querySelector(".layer.vegetation"),
};

let selectedFile = null;
let lastAnalysis = null;
let logTimer = null;
let activeStream = null;
const logQueue = [];

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
    logTimer = setTimeout(runNext, next.delay ?? 320);
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

const setKpis = (analysis) => {
  elements.kpiRisk.textContent = analysis?.riskScore ?? 0;
  const hasAlert = analysis?.inconsistency?.severity === "CRITICAL_ALERT";
  elements.kpiAlerts.textContent = hasAlert ? 1 : analysis?.inconsistency ? 1 : 0;
  elements.kpiAnchors.textContent = analysis?.regulatoryRefs?.length || 0;
  elements.kpiOverlaps.textContent = analysis?.overlaps?.length || 0;
};

const setEnvironment = (environment) => {
  if (!elements.envAqi) {
    return;
  }

  if (!environment) {
    elements.envAqi.textContent = "--";
    elements.envAqiCategory.textContent = "--";
    elements.envPm25.textContent = "--";
    elements.envPm25Units.textContent = "";
    elements.envTemp.textContent = "--";
    elements.envFeelsLike.textContent = "";
    elements.envHumidity.textContent = "--";
    elements.envCondition.textContent = "";
    if (elements.envNote) {
      elements.envNote.textContent = "Source: Google Air Quality & Weather";
    }
    return;
  }

  const aqi = environment.airQuality?.aqi;
  const category = environment.airQuality?.category;
  const pm25 = environment.airQuality?.pm25;
  const pm25Units = environment.airQuality?.pm25Units;
  const temp = environment.weather?.temperatureC;
  const feelsLike = environment.weather?.feelsLikeC;
  const humidity = environment.weather?.humidity;
  const condition = environment.weather?.condition;

  elements.envAqi.textContent = Number.isFinite(aqi) ? `${aqi}` : "--";
  elements.envAqiCategory.textContent = category || "--";
  elements.envPm25.textContent = Number.isFinite(pm25) ? `${pm25}` : "--";
  elements.envPm25Units.textContent = pm25Units ? String(pm25Units).replace(/_/g, " ").toLowerCase() : "";
  elements.envTemp.textContent = Number.isFinite(temp) ? `${temp}°C` : "--";
  elements.envFeelsLike.textContent = Number.isFinite(feelsLike) ? `Feels like ${feelsLike}°C` : "";
  elements.envHumidity.textContent = Number.isFinite(humidity) ? `${humidity}%` : "--";
  elements.envCondition.textContent = condition || "";

  if (elements.envNote) {
    if (environment.errors && environment.errors.length) {
      elements.envNote.textContent = `Context partial: ${environment.errors.join(" | ")}`;
    } else if (environment.fetchedAt) {
      elements.envNote.textContent = `Updated ${new Date(environment.fetchedAt).toLocaleTimeString()}`;
    }
  }
};

const setLoading = (loading) => {
  elements.runAuditBtn.disabled = loading;
  elements.runAuditBtn.textContent = loading ? "Running Audit..." : "Run Audit";
};

const buildRoadmap = (analysis) => {
  if (!analysis) {
    return "Run an audit to generate the correction roadmap.";
  }

  const lines = [
    "Correction Roadmap",
    "===================",
    `Project: ${elements.projectName.value || "Untitled"}`,
    `Industry: ${elements.industry.value}`,
    `Scenario: ${elements.scenario.value}`,
    "",
    "Priority Actions:",
    `1. Verify claims language: ${analysis.inconsistency?.claimed || "N/A"}`,
    "2. Align engineering specs with environmental impact limits.",
    `3. Address regulatory references: ${(analysis.regulatoryRefs || []).join("; ")}`,
    `4. Resolve geospatial conflicts: ${analysis.zoneSummary || "No overlaps detected."}`,
    "",
    "Submission Checklist:",
    "- Updated impact narrative",
    "- Revised mitigation plan",
    "- Evidence of remediation commitments",
  ];

  return lines.join("\n");
};

const updateUI = (analysis) => {
  if (!analysis) {
    return;
  }

  setGauge(analysis.riskScore || 0);
  setKpis(analysis);
  setEnvironment(analysis.environment);

  if (analysis.inconsistency) {
    elements.claimedText.textContent = analysis.inconsistency.claimed;
    elements.realityText.textContent = analysis.inconsistency.reality;
    elements.legalText.textContent = analysis.inconsistency.legal;

    if (analysis.inconsistency.severity === "CRITICAL_ALERT") {
      elements.severityChip.textContent = "Critical";
      elements.severityChip.classList.add("alert");
      if (elements.summaryStatus) {
        elements.summaryStatus.textContent = "Critical";
      }
    } else {
      elements.severityChip.textContent = "Review";
      elements.severityChip.classList.remove("alert");
      if (elements.summaryStatus) {
        elements.summaryStatus.textContent = "Review";
      }
    }
  } else {
    elements.claimedText.textContent = "Awaiting project claims.";
    elements.realityText.textContent = "Awaiting engineering specs.";
    elements.legalText.textContent = "No conflicts detected.";
    elements.severityChip.textContent = "Stable";
    elements.severityChip.classList.remove("alert");
    if (elements.summaryStatus) {
      elements.summaryStatus.textContent = "Stable";
    }
  }

  if (analysis.llmSummary) {
    appendLog("GPT_Reasoning_Engine", analysis.llmSummary);
  }
};

const createProject = async () => {
  const formData = new FormData();
  formData.append("name", elements.projectName.value || "");
  formData.append("industry", elements.industry.value || "");
  formData.append("scenario", elements.scenario.value || "");
  formData.append("lat", elements.lat.value || "");
  formData.append("lng", elements.lng.value || "");
  formData.append("claims", elements.claims.value || "");
  formData.append("specs", elements.specs.value || "");
  if (selectedFile) {
    formData.append("file", selectedFile);
  }

  const response = await fetch(`${API_BASE_URL}/api/projects`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to create project.");
  }

  const payload = await response.json();
  return payload.project;
};

const createAudit = async (projectId) => {
  const response = await fetch(`${API_BASE_URL}/api/audits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to create audit.");
  }

  const payload = await response.json();
  return payload.audit;
};

const streamAudit = (audit, onComplete) => {
  if (activeStream) {
    activeStream.close();
    activeStream = null;
  }

  let received = 0;
  const stream = new EventSource(`${API_BASE_URL}/api/audits/${audit.id}/stream`);
  activeStream = stream;

  stream.addEventListener("log", (event) => {
    received += 1;
    const data = JSON.parse(event.data);
    appendLog(data.agent, data.message);
  });

  stream.addEventListener("done", () => {
    stream.close();
    if (activeStream === stream) {
      activeStream = null;
    }
    updateUI(audit.analysis);
    if (onComplete) {
      onComplete();
    }
  });

  stream.onerror = () => {
    if (activeStream !== stream) {
      return;
    }
    stream.close();
    activeStream = null;

    if (received === 0 && Array.isArray(audit.logs)) {
      appendLog("System", "Live stream unavailable. Replaying cached logs.");
      const fallback = audit.logs.map((log) => ({ ...log, delay: 240 }));
      enqueueLogs(fallback, () => {
        updateUI(audit.analysis);
        if (onComplete) {
          onComplete();
        }
      });
      return;
    }

    appendLog("System", "Stream interrupted.");
    updateUI(audit.analysis);
    if (onComplete) {
      onComplete();
    }
  };
};

const runAudit = async () => {
  setLoading(true);
  resetTerminal();
  appendLog("System", `Connecting to ${API_BASE_URL}...`);

  try {
    const project = await createProject();
    appendLog("System", `Project created: ${project.id}.`);
    const audit = await createAudit(project.id);
    lastAnalysis = audit.analysis;
    streamAudit(audit, () => setLoading(false));
  } catch (error) {
    appendLog("System", `Error: ${error.message}`);
    setLoading(false);
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

  selectedFile = file;

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
      mapTypeId: "satellite",
      mapTypeControl: false,
      fullscreenControl: false,
      streetViewControl: false,
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
setKpis(null);
setEnvironment(null);
