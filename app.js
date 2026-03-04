const APP_CONFIG = window.APP_CONFIG || {};

const resolveMapsKey = () => {
  const params = new URLSearchParams(window.location.search);
  const param = params.get("maps_key");
  if (param) {
    localStorage.setItem("GMAPS_API_KEY", param);
    return param;
  }
  return localStorage.getItem("GMAPS_API_KEY") || APP_CONFIG.GMAPS_API_KEY || "";
};

const resolveApiBaseUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const param = params.get("api");
  if (param) {
    localStorage.setItem("API_BASE_URL", param);
    return param;
  }
  return localStorage.getItem("API_BASE_URL") || APP_CONFIG.API_BASE_URL || "http://localhost:5050";
};

const GMAPS_API_KEY = resolveMapsKey();
const API_BASE_URL = resolveApiBaseUrl().replace(/\/$/, "");

const DEMO_LAWEN = {
  name: "Lawen - Bosque y Mar",
  projectType: "Inmobiliario",
  mode: "EIA_QA",
  coordinates: { lat: -38.087682, lng: -57.582513 },
  boundaryGeoJSON: {
    type: "Polygon",
    coordinates: [[
      [-57.5882, -38.0808],
      [-57.5772, -38.0702],
      [-57.5652, -38.0804],
      [-57.5768, -38.0931],
      [-57.5882, -38.0808],
    ]],
  },
  claims:
    "El proyecto declara impacto neutral en el sistema hídrico y preservación del bosque existente.",
  specs:
    "Incluye desagües pluviales y descarga tratada al arroyo, con apertura de calles y remoción selectiva.",
};

const state = {
  mode: "PRE_EIA",
  stage: "setup",
  currentCaseId: "",
  currentRun: null,
  caseDirty: true,
  selectedFile: null,
  boundaryGeoJSON: null,
  map: null,
  mapMarker: null,
  mapPolygon: null,
  pendingMapPayload: null,
  activeStream: null,
};

const elements = {
  heroSubtitle: document.getElementById("heroSubtitle"),
  modeButtons: Array.from(document.querySelectorAll(".mode-btn")),
  flowSteps: Array.from(document.querySelectorAll(".flow-step")),
  stageChip: document.getElementById("stageChip"),
  modeBadge: document.getElementById("modeBadge"),
  setupScreen: document.getElementById("setupScreen"),
  resultScreen: document.getElementById("resultScreen"),
  evidenceScreen: document.getElementById("evidenceScreen"),
  exportScreen: document.getElementById("exportScreen"),

  projectName: document.getElementById("projectName"),
  projectType: document.getElementById("projectType"),
  lat: document.getElementById("lat"),
  lng: document.getElementById("lng"),
  claims: document.getElementById("claims"),
  specs: document.getElementById("specs"),
  monitoringBlock: document.getElementById("monitoringBlock"),
  monitoringEnabled: document.getElementById("monitoringEnabled"),
  monitoringFrequency: document.getElementById("monitoringFrequency"),

  fileInput: document.getElementById("fileInput"),
  chooseFileBtn: document.getElementById("chooseFileBtn"),
  chooseBoundaryBtn: document.getElementById("chooseBoundaryBtn"),
  fileNameLabel: document.getElementById("fileNameLabel"),
  boundaryInput: document.getElementById("boundaryInput"),
  boundaryStatus: document.getElementById("boundaryStatus"),
  checkLocation: document.getElementById("checkLocation"),
  checkBoundary: document.getElementById("checkBoundary"),
  checkEia: document.getElementById("checkEia"),
  checkClaims: document.getElementById("checkClaims"),

  loadLawenBtn: document.getElementById("loadLawenBtn"),
  clearCaseBtn: document.getElementById("clearCaseBtn"),
  primaryActionBtn: document.getElementById("primaryActionBtn"),
  setupMessage: document.getElementById("setupMessage"),

  decisionLabel: document.getElementById("decisionLabel"),
  decisionNote: document.getElementById("decisionNote"),
  overallConfidence: document.getElementById("overallConfidence"),
  decisionBanner: document.getElementById("decisionBanner"),
  decisionBannerTitle: document.getElementById("decisionBannerTitle"),
  decisionBannerText: document.getElementById("decisionBannerText"),
  icetGauge: document.getElementById("icetGauge"),
  icetValue: document.getElementById("icetValue"),
  exposureLevel: document.getElementById("exposureLevel"),
  topAlerts: document.getElementById("topAlerts"),
  indicesTableBody: document.getElementById("indicesTableBody"),

  runDuration: document.getElementById("runDuration"),
  contradictionCount: document.getElementById("contradictionCount"),
  overlapCount: document.getElementById("overlapCount"),
  updatedAt: document.getElementById("updatedAt"),

  tabButtons: Array.from(document.querySelectorAll(".tab-btn")),
  tabPanels: Array.from(document.querySelectorAll(".tab-panel")),

  map: document.getElementById("map"),
  mapPlaceholder: document.getElementById("mapPlaceholder"),
  mapStatus: document.getElementById("mapStatus"),

  complianceTableBody: document.getElementById("complianceTableBody"),
  regulatoryRefsList: document.getElementById("regulatoryRefsList"),
  contradictionsList: document.getElementById("contradictionsList"),

  planetCount: document.getElementById("planetCount"),
  planetLatest: document.getElementById("planetLatest"),
  planetCloud: document.getElementById("planetCloud"),
  planetConfidence: document.getElementById("planetConfidence"),
  procNdvi: document.getElementById("procNdvi"),
  procNdwi: document.getElementById("procNdwi"),
  procSource: document.getElementById("procSource"),
  procConfidence: document.getElementById("procConfidence"),

  envAqi: document.getElementById("envAqi"),
  envCategory: document.getElementById("envCategory"),
  envPm25: document.getElementById("envPm25"),
  envTemp: document.getElementById("envTemp"),
  envHumidity: document.getElementById("envHumidity"),
  envCondition: document.getElementById("envCondition"),
  envStatus: document.getElementById("envStatus"),

  traceabilityBody: document.getElementById("traceabilityBody"),
  terminal: document.getElementById("terminal"),

  roadmapList: document.getElementById("roadmapList"),
  exportJsonBtn: document.getElementById("exportJsonBtn"),
  exportPdfBtn: document.getElementById("exportPdfBtn"),
};

const normalizeMode = (mode) => {
  const normalized = String(mode || "PRE_EIA").toUpperCase().replace(/-/g, "_");
  if (["PRE_EIA", "EIA_QA", "LIVING_EIA"].includes(normalized)) {
    return normalized;
  }
  return "PRE_EIA";
};

const modeLabel = (mode) => {
  if (mode === "EIA_QA") {
    return "EIA QA";
  }
  if (mode === "LIVING_EIA") {
    return "Living EIA";
  }
  return "Pre‑EIA";
};

const modeSubtitle = (mode) => {
  if (mode === "EIA_QA") {
    return "Audita un EIA existente: detecta contradicciones entre claims, ingeniería, normativa y señales territoriales.";
  }
  if (mode === "LIVING_EIA") {
    return "Monitorea cambios del caso en el tiempo: nuevas alertas, delta ICET y trazabilidad por corrida.";
  }
  return "Filtro temprano de inversión territorial para decidir en minutos antes de gastar meses en ingeniería.";
};

const toIsoDate = (value) => {
  if (!value) {
    return "--";
  }
  try {
    return new Date(value).toLocaleString();
  } catch (_error) {
    return "--";
  }
};

const getCoordinates = () => {
  const latRaw = String(elements.lat.value || "").trim();
  const lngRaw = String(elements.lng.value || "").trim();
  if (!latRaw || !lngRaw) {
    return null;
  }
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
};

const extractPolygonRing = (boundary) => {
  if (!boundary) {
    return null;
  }
  if (boundary.type === "FeatureCollection") {
    return extractPolygonRing(boundary.features?.[0]);
  }
  if (boundary.type === "Feature") {
    return extractPolygonRing(boundary.geometry);
  }
  if (boundary.type === "Polygon") {
    return boundary.coordinates?.[0] || null;
  }
  if (boundary.type === "MultiPolygon") {
    return boundary.coordinates?.[0]?.[0] || null;
  }
  return null;
};

const centroidFromRing = (ring) => {
  if (!Array.isArray(ring) || !ring.length) {
    return null;
  }
  let lat = 0;
  let lng = 0;
  let count = 0;
  ring.forEach((coord) => {
    const [x, y] = coord;
    if (Number.isFinite(y) && Number.isFinite(x)) {
      lat += y;
      lng += x;
      count += 1;
    }
  });
  if (!count) {
    return null;
  }
  return { lat: lat / count, lng: lng / count };
};

const appendLog = (agent, message) => {
  const line = document.createElement("div");
  line.className = "terminal-line";
  line.innerHTML = `<strong>${agent}</strong> ${message}`;
  elements.terminal.appendChild(line);
  elements.terminal.scrollTop = elements.terminal.scrollHeight;
};

const resetLog = () => {
  elements.terminal.innerHTML = "";
};

const setStage = (stage) => {
  state.stage = stage;
  elements.stageChip.textContent = `Estado: ${stage}`;

  elements.resultScreen.classList.toggle("hidden", stage === "setup");
  elements.evidenceScreen.classList.toggle("hidden", stage === "setup");
  elements.exportScreen.classList.toggle("hidden", stage === "setup");

  const flowState = {
    setup: "setup",
    running: "setup",
    results: "results",
  };
  const currentFlow = flowState[stage] || "setup";
  const reached = currentFlow === "results" ? ["setup", "results", "evidence", "export"] : ["setup"];

  elements.flowSteps.forEach((step) => {
    const flow = step.dataset.flow;
    step.classList.toggle("active", flow === currentFlow);
    step.classList.toggle("done", reached.includes(flow) && flow !== currentFlow);
  });

  if (stage === "running") {
    elements.primaryActionBtn.disabled = true;
    elements.primaryActionBtn.textContent = "Ejecutando...";
    return;
  }

  elements.primaryActionBtn.disabled = false;
  if (stage === "results") {
    elements.primaryActionBtn.textContent = "Ver exportables";
  } else {
    elements.primaryActionBtn.textContent = "Ejecutar análisis";
  }
};

const updateModeUI = () => {
  elements.modeButtons.forEach((btn) => {
    const active = btn.dataset.mode === state.mode;
    btn.classList.toggle("active", active);
  });
  if (elements.heroSubtitle) {
    elements.heroSubtitle.textContent = modeSubtitle(state.mode);
  }
  elements.modeBadge.textContent = `Modo: ${modeLabel(state.mode)}`;
  if (elements.monitoringBlock) {
    elements.monitoringBlock.classList.toggle("hidden", state.mode !== "LIVING_EIA");
  }
};

const setMessage = (message, level = "info") => {
  elements.setupMessage.textContent = message;
  elements.setupMessage.style.borderColor = level === "error" ? "#e9b5bd" : "var(--line)";
  elements.setupMessage.style.background = level === "error" ? "#fff0f2" : "#f5f8ff";
};

const setCheck = (element, ok, label) => {
  if (!element) {
    return;
  }
  element.className = `check ${ok ? "done" : "pending"}`;
  element.textContent = `${ok ? "Listo" : "Pendiente"} · ${label}`;
};

const updateChecklist = () => {
  const coords = getCoordinates();
  const hasBoundary = Boolean(state.boundaryGeoJSON);
  const hasEia = Boolean(state.selectedFile);
  const hasClaims = Boolean(String(elements.claims.value || "").trim());
  const hasSpecs = Boolean(String(elements.specs.value || "").trim());

  setCheck(elements.checkLocation, Boolean(coords), "Ubicación cargada");
  setCheck(elements.checkBoundary, hasBoundary, "Polígono de predio");
  setCheck(elements.checkEia, hasEia, "Documento EIA");
  setCheck(elements.checkClaims, hasClaims && hasSpecs, "Claims y specs completos");
};

const validateSetup = () => {
  const errors = [];

  if (!String(elements.projectName.value || "").trim()) {
    errors.push("Falta nombre del proyecto");
  }

  const coordinates = getCoordinates();
  const hasBoundary = Boolean(state.boundaryGeoJSON);

  if (!coordinates && !hasBoundary) {
    errors.push("Falta ubicación: ingresa coordenadas o polígono");
  }

  if (state.mode === "EIA_QA") {
    const hasText = Boolean(String(elements.claims.value || "").trim() || String(elements.specs.value || "").trim());
    if (!state.selectedFile && !hasText) {
      errors.push("En EIA QA debes cargar PDF/TXT o claims/specs");
    }
  }

  return errors;
};

const readBoundaryFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      try {
        if (file.name.toLowerCase().endsWith(".kml")) {
          const parser = new DOMParser();
          const xml = parser.parseFromString(text, "text/xml");
          const coordinatesNode = xml.querySelector("Polygon coordinates, LinearRing coordinates, coordinates");
          if (!coordinatesNode) {
            reject(new Error("KML sin coordenadas."));
            return;
          }
          const ring = coordinatesNode.textContent
            .trim()
            .split(/\s+/)
            .map((entry) => entry.split(",").map(Number))
            .filter((parts) => parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]))
            .map(([lng, lat]) => [lng, lat]);

          if (ring.length < 3) {
            reject(new Error("KML inválido."));
            return;
          }

          resolve({
            type: "Polygon",
            coordinates: [ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring : [...ring, ring[0]]],
          });
          return;
        }

        const parsed = JSON.parse(text);
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo de polígono."));
    reader.readAsText(file);
  });

const updateMap = ({ coordinates, boundaryGeoJSON }) => {
  if (!coordinates && !boundaryGeoJSON) {
    return;
  }

  const ring = extractPolygonRing(boundaryGeoJSON);
  const polygonPath = ring ? ring.map(([lng, lat]) => ({ lat, lng })) : null;
  const center = coordinates || centroidFromRing(ring);

  state.pendingMapPayload = { center, polygonPath };

  if (!state.map || !window.google?.maps) {
    return;
  }

  if (center) {
    state.map.setCenter(center);
    state.map.setZoom(15);
  }

  if (state.mapMarker) {
    state.mapMarker.setMap(null);
  }
  if (center) {
    state.mapMarker = new window.google.maps.Marker({
      position: center,
      map: state.map,
      title: "Proyecto",
    });
  }

  if (state.mapPolygon) {
    state.mapPolygon.setMap(null);
  }

  if (polygonPath) {
    state.mapPolygon = new window.google.maps.Polygon({
      paths: polygonPath,
      strokeColor: "#145cf3",
      strokeOpacity: 0.85,
      strokeWeight: 2,
      fillColor: "#145cf3",
      fillOpacity: 0.15,
    });
    state.mapPolygon.setMap(state.map);

    const bounds = new window.google.maps.LatLngBounds();
    polygonPath.forEach((point) => bounds.extend(point));
    state.map.fitBounds(bounds);
  }

  if (elements.mapPlaceholder) {
    elements.mapPlaceholder.style.display = "none";
  }
};

const setGauge = (value) => {
  const score = Math.max(0, Math.min(100, Math.round(value || 0)));
  let color = "#1d8f5f";
  if (score >= 80) {
    color = "#cc3345";
  } else if (score >= 60) {
    color = "#d66d1f";
  } else if (score >= 35) {
    color = "#bd8b1a";
  }

  elements.icetGauge.style.setProperty("--value", score);
  elements.icetGauge.style.setProperty("--color", color);
  elements.icetValue.textContent = String(score);
};

const renderExecutive = (run) => {
  const executive = run.executiveResult || {};
  const confidence = run.evidencePack?.confidence?.overall;
  const decisionValue = String(executive.decision?.value || "").toUpperCase();
  const bannerTone =
    decisionValue === "GO"
      ? "positive"
      : decisionValue === "GO_WITH_MINOR_MITIGATIONS"
        ? "caution"
        : decisionValue === "GO_WITH_STRUCTURAL_REDESIGN"
          ? "high"
          : decisionValue === "NO_GO"
            ? "critical"
            : "neutral";

  elements.decisionLabel.textContent = executive.decision?.label || "Sin decisión";
  elements.decisionNote.textContent = executive.decision?.note || "";
  elements.overallConfidence.textContent = confidence
    ? `${confidence.level} (${Math.round(confidence.score * 100)}%)`
    : "--";
  elements.exposureLevel.textContent = executive.exposureLevel || "--";

  if (elements.decisionBanner) {
    elements.decisionBanner.className = `decision-banner ${bannerTone}`;
    elements.decisionBannerTitle.textContent = executive.decision?.label || "Pendiente";
    elements.decisionBannerText.textContent =
      executive.decision?.note || "Sin información para recomendar una decisión de negocio.";
  }

  setGauge(executive.icet || 0);

  const alerts = executive.topAlerts || [];
  elements.topAlerts.innerHTML = alerts.length
    ? alerts
        .map((item) => {
          const severity = String(item.severity || "Media");
          const severityClass =
            severity === "Bloqueante" ? "crit" : severity === "Alta" ? "high" : severity === "Media" ? "med" : "low";
          return `
            <li class="alert-row">
              <span class="sev ${severityClass}">${severity}</span>
              <div><strong>${item.type}</strong> · ${item.message}</div>
            </li>
          `;
        })
        .join("")
    : "<li>Sin alertas relevantes.</li>";

  const indices = executive.indices || [];
  elements.indicesTableBody.innerHTML = indices
    .map(
      (item) => `
      <tr>
        <td>${item.label}</td>
        <td>${item.score}</td>
        <td>${item.level}</td>
        <td>${item.mitigability}</td>
      </tr>`
    )
    .join("");

  elements.runDuration.textContent = run.durationMs ? `${Math.round(run.durationMs / 1000)} s` : "--";
  elements.contradictionCount.textContent = String(run.evidencePack?.contradictions?.length || 0);
  elements.overlapCount.textContent = String(run.evidencePack?.overlaps?.length || 0);
  elements.updatedAt.textContent = toIsoDate(executive.updatedAt || run.finishedAt);
};

const renderRegulatory = (run) => {
  const matrix = run.evidencePack?.complianceMatrix || [];
  elements.complianceTableBody.innerHTML = matrix.length
    ? matrix
        .map(
          (row) => `
          <tr>
            <td>${row.requirement}</td>
            <td>${row.evidence}</td>
            <td>${row.status}</td>
            <td>${row.confidence}</td>
            <td>${row.source}</td>
          </tr>`
        )
        .join("")
    : '<tr><td colspan="5">Sin matriz disponible.</td></tr>';

  const refs = run.evidencePack?.regulatoryRefs || [];
  elements.regulatoryRefsList.innerHTML = refs.length ? refs.map((ref) => `<li>${ref}</li>`).join("") : "<li>Sin referencias.</li>";
};

const renderContradictions = (run) => {
  const list = run.evidencePack?.contradictions || [];
  elements.contradictionsList.innerHTML = list.length
    ? list
        .map((item) => {
          const severity = String(item.severity || "Media");
          const severityClass =
            severity === "Bloqueante" ? "crit" : severity === "Alta" ? "high" : severity === "Media" ? "med" : "low";
          return `<li class="alert-row"><span class="sev ${severityClass}">${severity}</span><div>${item.message}</div></li>`;
        })
        .join("")
    : "<li>Sin contradicciones automáticas.</li>";
};

const renderSatellite = (run) => {
  const scenes = run.evidencePack?.satellite?.scenes;
  const processing = run.evidencePack?.satellite?.processing;
  const confidence = run.evidencePack?.confidence || {};

  elements.planetCount.textContent = Number.isFinite(scenes?.count) ? String(scenes.count) : "--";
  elements.planetLatest.textContent = scenes?.latestAcquired ? toIsoDate(scenes.latestAcquired) : scenes?.error || "--";
  elements.planetCloud.textContent = Number.isFinite(scenes?.avgCloudCover)
    ? `${Math.round(scenes.avgCloudCover * 100)}%`
    : "--";
  elements.planetConfidence.textContent = confidence.planet ? `${confidence.planet.level}` : "--";

  elements.procNdvi.textContent = Number.isFinite(processing?.ndviMean) ? processing.ndviMean.toFixed(2) : "--";
  elements.procNdwi.textContent = Number.isFinite(processing?.ndwiMean) ? processing.ndwiMean.toFixed(2) : "--";
  elements.procSource.textContent = processing?.source || processing?.error || "--";
  elements.procConfidence.textContent = confidence.processing ? `${confidence.processing.level}` : "--";
};

const renderEnvironment = (run) => {
  const env = run.evidencePack?.environment;
  const confidence = run.evidencePack?.confidence?.environment;

  elements.envAqi.textContent = Number.isFinite(env?.airQuality?.aqi) ? String(env.airQuality.aqi) : "--";
  elements.envCategory.textContent = env?.airQuality?.category || "--";
  elements.envPm25.textContent = Number.isFinite(env?.airQuality?.pm25) ? `${env.airQuality.pm25}` : "--";
  elements.envTemp.textContent = Number.isFinite(env?.weather?.temperatureC) ? `${env.weather.temperatureC}°C` : "--";
  elements.envHumidity.textContent = Number.isFinite(env?.weather?.humidity) ? `${env.weather.humidity}%` : "--";
  elements.envCondition.textContent = env?.weather?.condition || "--";

  if (env?.errors?.length) {
    elements.envStatus.textContent = `APIs externas parciales: ${env.errors.join(" | ")}`;
  } else {
    elements.envStatus.textContent = `Fuente: Google Air Quality + Weather · Confianza ${confidence?.level || "--"}`;
  }
};

const renderTraceability = (run) => {
  const traceability = run.evidencePack?.traceability || [];
  elements.traceabilityBody.innerHTML = traceability.length
    ? traceability
        .map(
          (item) => `
          <tr>
            <td>${item.source}</td>
            <td>${toIsoDate(item.timestamp)}</td>
            <td>${item.method}</td>
            <td>${item.confidence}</td>
            <td>${item.note}</td>
          </tr>`
        )
        .join("")
    : '<tr><td colspan="5">Sin trazabilidad disponible.</td></tr>';

  resetLog();
  (run.logs || []).forEach((entry) => {
    appendLog(entry.agent || "System", entry.message || "");
  });
};

const renderRoadmap = (run) => {
  const actions = run.roadmap?.actions || [];
  elements.roadmapList.innerHTML = actions.length
    ? actions
        .map(
          (item) =>
            `<li><strong>${item.priority}</strong> · ${item.title} — ${item.detail} <em>(${item.timeline}, ${item.estimatedCost})</em></li>`
        )
        .join("")
    : "<li>Sin acciones sugeridas.</li>";
};

const renderEvidence = (run) => {
  renderRegulatory(run);
  renderContradictions(run);
  renderSatellite(run);
  renderEnvironment(run);
  renderTraceability(run);

  const coordinates = run.caseSnapshot?.location?.coordinates || getCoordinates();
  const boundary = run.caseSnapshot?.boundaryGeoJSON || state.boundaryGeoJSON;
  updateMap({ coordinates, boundaryGeoJSON: boundary });

  if (run.evidencePack?.overlaps?.length) {
    elements.mapStatus.textContent = `${run.evidencePack.overlaps.length} solapamientos detectados en zonas sensibles.`;
  } else {
    elements.mapStatus.textContent = "Sin solapamientos sensibles detectados en chequeo inicial.";
  }
};

const renderRun = (run) => {
  state.currentRun = run;
  renderExecutive(run);
  renderEvidence(run);
  renderRoadmap(run);
  setStage("results");
  setMessage("Análisis completado. Revisa decisión, evidencia y exportables.");
};

const collectCasePayload = async () => {
  const formData = new FormData();
  formData.append("name", String(elements.projectName.value || "").trim());
  formData.append("projectType", elements.projectType.value || "Inmobiliario");
  formData.append("mode", state.mode);
  formData.append("lat", elements.lat.value || "");
  formData.append("lng", elements.lng.value || "");
  formData.append("claims", elements.claims.value || "");
  formData.append("specs", elements.specs.value || "");

  if (state.boundaryGeoJSON) {
    formData.append("boundary", JSON.stringify(state.boundaryGeoJSON));
  }

  if (state.selectedFile) {
    formData.append("file", state.selectedFile);
  }

  return formData;
};

const createCaseIfNeeded = async () => {
  if (state.currentCaseId && !state.caseDirty && state.mode !== "LIVING_EIA") {
    return state.currentCaseId;
  }

  if (state.mode === "LIVING_EIA" && state.currentCaseId && !state.caseDirty) {
    return state.currentCaseId;
  }

  const payload = await collectCasePayload();
  const response = await fetch(`${API_BASE_URL}/api/v2/cases`, {
    method: "POST",
    body: payload,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "No se pudo crear el caso.");
  }

  const data = await response.json();
  state.currentCaseId = data.case.id;
  state.caseDirty = false;
  return state.currentCaseId;
};

const openStream = (runId) => {
  if (state.activeStream) {
    state.activeStream.close();
    state.activeStream = null;
  }

  return new Promise((resolve) => {
    const stream = new EventSource(`${API_BASE_URL}/api/v2/runs/${runId}/stream`);
    state.activeStream = stream;

    stream.addEventListener("log", (event) => {
      const data = JSON.parse(event.data);
      appendLog(data.agent || "System", data.message || "");
    });

    stream.addEventListener("done", () => {
      stream.close();
      if (state.activeStream === stream) {
        state.activeStream = null;
      }
      resolve();
    });

    stream.onerror = () => {
      stream.close();
      if (state.activeStream === stream) {
        state.activeStream = null;
      }
      resolve();
    };
  });
};

const runAnalysis = async () => {
  const errors = validateSetup();
  if (errors.length) {
    setMessage(errors.join(". "), "error");
    return;
  }

  setStage("running");
  resetLog();
  appendLog("System", `Conectando a ${API_BASE_URL}`);

  try {
    const caseId = await createCaseIfNeeded();
    appendLog("Case", `Caso listo: ${caseId}`);

    const body = {
      mode: state.mode,
      claims: elements.claims.value || "",
      specs: elements.specs.value || "",
      lat: elements.lat.value || "",
      lng: elements.lng.value || "",
    };

    if (state.boundaryGeoJSON) {
      body.boundary = state.boundaryGeoJSON;
    }

    const started = Date.now();
    const response = await fetch(`${API_BASE_URL}/api/v2/cases/${caseId}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "No se pudo ejecutar el análisis.");
    }

    const data = await response.json();
    const run = data.run;

    if (state.mode === "LIVING_EIA") {
      await fetch(`${API_BASE_URL}/api/v2/cases/${caseId}/monitoring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: Boolean(elements.monitoringEnabled?.checked),
          frequency: elements.monitoringFrequency?.value || "weekly",
        }),
      });
    }

    appendLog("Run", `Run ${run.id} creado.`);
    await openStream(run.id);

    if (!elements.terminal.textContent.trim() && Array.isArray(run.logs)) {
      run.logs.forEach((entry) => appendLog(entry.agent || "System", entry.message || ""));
    }

    run.durationMs = run.durationMs || Date.now() - started;
    run.caseSnapshot = {
      id: caseId,
      name: elements.projectName.value,
      location: { coordinates: getCoordinates() || centroidFromRing(extractPolygonRing(state.boundaryGeoJSON)) },
      boundaryGeoJSON: state.boundaryGeoJSON,
    };

    renderRun(run);
  } catch (error) {
    setStage("setup");
    setMessage(error.message || "Error de ejecución.", "error");
    appendLog("Error", error.message || "Fallo inesperado");
  }
};

const downloadFile = (filename, content, type) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const exportJson = async () => {
  if (!state.currentRun?.id) {
    setMessage("No hay run para exportar.", "error");
    return;
  }

  const response = await fetch(`${API_BASE_URL}/api/v2/runs/${state.currentRun.id}/report?format=json`);
  if (!response.ok) {
    setMessage("No se pudo exportar JSON.", "error");
    return;
  }
  const payload = await response.json();
  downloadFile(`audit-run-${state.currentRun.id}.json`, JSON.stringify(payload.report, null, 2), "application/json");
};

const exportPdf = async () => {
  if (!state.currentRun?.id) {
    setMessage("No hay run para exportar.", "error");
    return;
  }

  const response = await fetch(`${API_BASE_URL}/api/v2/runs/${state.currentRun.id}/report?format=pdf`);
  if (!response.ok) {
    setMessage("No se pudo exportar PDF.", "error");
    return;
  }

  const buffer = await response.arrayBuffer();
  downloadFile(`audit-run-${state.currentRun.id}.pdf`, buffer, "application/pdf");
};

const onPrimaryAction = async () => {
  if (state.stage === "results") {
    elements.exportScreen.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  await runAnalysis();
};

const markDirty = () => {
  state.caseDirty = true;
  updateChecklist();
  if (state.stage === "results") {
    setStage("setup");
    setMessage("Cambios detectados. Ejecuta nuevamente para actualizar resultados.");
  }
};

const loadLawenDemo = () => {
  state.mode = normalizeMode(DEMO_LAWEN.mode);
  updateModeUI();

  elements.projectName.value = DEMO_LAWEN.name;
  elements.projectType.value = DEMO_LAWEN.projectType;
  elements.lat.value = String(DEMO_LAWEN.coordinates.lat);
  elements.lng.value = String(DEMO_LAWEN.coordinates.lng);
  elements.claims.value = DEMO_LAWEN.claims;
  elements.specs.value = DEMO_LAWEN.specs;

  state.boundaryGeoJSON = DEMO_LAWEN.boundaryGeoJSON;
  state.selectedFile = null;
  elements.fileInput.value = "";
  elements.fileNameLabel.textContent = "Sin archivo";
  elements.boundaryStatus.textContent = "Polígono demo Lawen cargado.";

  updateMap({
    coordinates: DEMO_LAWEN.coordinates,
    boundaryGeoJSON: state.boundaryGeoJSON,
  });

  markDirty();
  setMessage("Demo Lawen cargada. Ejecuta análisis.");
};

const clearCase = () => {
  elements.projectName.value = "";
  elements.projectType.value = "Inmobiliario";
  elements.lat.value = "";
  elements.lng.value = "";
  elements.claims.value = "";
  elements.specs.value = "";

  elements.fileInput.value = "";
  state.selectedFile = null;
  elements.fileNameLabel.textContent = "Sin archivo";

  elements.boundaryInput.value = "";
  state.boundaryGeoJSON = null;
  elements.boundaryStatus.textContent = "Sin polígono cargado.";

  state.currentCaseId = "";
  state.currentRun = null;
  state.caseDirty = true;

  if (elements.decisionBanner) {
    elements.decisionBanner.className = "decision-banner neutral";
    elements.decisionBannerTitle.textContent = "Pendiente de ejecución";
    elements.decisionBannerText.textContent = "Carga el caso y ejecuta el análisis para obtener recomendación.";
  }

  setStage("setup");
  resetLog();
  setGauge(0);
  updateChecklist();
  setMessage("Caso limpio. Completa datos mínimos para iniciar.");
};

const bindTabs = () => {
  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      elements.tabButtons.forEach((btn) => btn.classList.toggle("active", btn === button));
      elements.tabPanels.forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.panel === tab);
      });
    });
  });
};

const initMap = () => {
  if (!GMAPS_API_KEY) {
    elements.mapPlaceholder.textContent = "Agrega ?maps_key=TU_KEY o config.js para habilitar mapa satelital.";
    return;
  }

  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_API_KEY}`;
  script.async = true;
  script.onload = () => {
    const initialCenter = getCoordinates() || DEMO_LAWEN.coordinates;
    state.map = new window.google.maps.Map(elements.map, {
      center: initialCenter,
      zoom: 13,
      mapTypeId: "satellite",
      mapTypeControl: false,
      fullscreenControl: true,
      streetViewControl: false,
    });

    if (state.pendingMapPayload) {
      updateMap({
        coordinates: state.pendingMapPayload.center,
        boundaryGeoJSON: state.boundaryGeoJSON,
      });
    }
  };
  document.body.appendChild(script);
};

const bindEvents = () => {
  elements.modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.mode = normalizeMode(btn.dataset.mode);
      updateModeUI();
      markDirty();
      setMessage(`Modo ${modeLabel(state.mode)} seleccionado.`);
    });
  });

  elements.chooseFileBtn.addEventListener("click", () => elements.fileInput.click());
  if (elements.chooseBoundaryBtn) {
    elements.chooseBoundaryBtn.addEventListener("click", () => elements.boundaryInput.click());
  }
  elements.fileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0] || null;
    state.selectedFile = file;
    elements.fileNameLabel.textContent = file ? file.name : "Sin archivo";
    markDirty();
  });

  elements.boundaryInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const geojson = await readBoundaryFile(file);
      state.boundaryGeoJSON = geojson;
      const center = centroidFromRing(extractPolygonRing(geojson));
      if (center) {
        elements.lat.value = center.lat.toFixed(6);
        elements.lng.value = center.lng.toFixed(6);
      }
      elements.boundaryStatus.textContent = `Polígono cargado: ${file.name}`;
      updateMap({ coordinates: center || getCoordinates(), boundaryGeoJSON: geojson });
      markDirty();
    } catch (error) {
      elements.boundaryStatus.textContent = `Error de polígono: ${error.message}`;
      setMessage(`No se pudo leer el polígono: ${error.message}`, "error");
    }
  });

  [elements.projectName, elements.projectType, elements.lat, elements.lng, elements.claims, elements.specs].forEach((input) => {
    input.addEventListener("input", markDirty);
  });

  elements.loadLawenBtn.addEventListener("click", loadLawenDemo);
  elements.clearCaseBtn.addEventListener("click", clearCase);
  elements.primaryActionBtn.addEventListener("click", onPrimaryAction);

  elements.exportJsonBtn.addEventListener("click", exportJson);
  elements.exportPdfBtn.addEventListener("click", exportPdf);
};

const bootstrap = () => {
  updateModeUI();
  bindTabs();
  bindEvents();
  initMap();
  setGauge(0);
  updateChecklist();
  setMessage("Completa datos mínimos para iniciar.");
  appendLog("System", `Frontend iniciado. API: ${API_BASE_URL}`);
};

bootstrap();
