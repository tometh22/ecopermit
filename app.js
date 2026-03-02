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

const GMAPS_API_KEY = resolveMapsKey();

const resolveApiBaseUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const param = params.get("api");
  if (param) {
    localStorage.setItem("API_BASE_URL", param);
    return param;
  }
  return localStorage.getItem("API_BASE_URL") || APP_CONFIG.API_BASE_URL || "http://localhost:5050";
};

const API_BASE_URL = resolveApiBaseUrl().replace(/\/$/, "");

const DEMO_CASES = {
  lawen: {
    id: "lawen",
    name: "Lawen - Bosque y Mar (demo prensa)",
    industry: "Inmobiliario",
    scenario: "Inmobiliario",
    coordinates: { lat: -38.087682, lng: -57.582513 },
    area_m2: 724660.04,
    perimeter_m: 3910,
    claims:
      "El estudio declara un buffer de 15 m a cada lado del arroyo y sostiene que el proyecto preserva el equilibrio ambiental del bosque.",
    specs:
      "Se proyectan desagües con descarga al arroyo, planta de tratamiento propia y consumo de agua estimado en 285 m³/día.",
    regulatoryRefs: [
      "Ley 13.273 - Bosques Protectores (petitorio vecinal)",
      "Solicitud de DIA negativa y modelado hidrológico",
      "Buffer hídrico de 15 m a cada lado del arroyo (según prensa)",
    ],
    sources: [
      {
        title: "Lawen: barrio privado en bosque con arroyo",
        url: "https://quedigital.com.ar/sociedad/lawen-un-barrio-privado-mas-en-medio-de-un-bosque-y-atravesado-por-un-arroyo/",
      },
      {
        title: "Piden declarar inviable el proyecto Lawen",
        url: "https://quedigital.com.ar/sociedad/lawen-piden-que-se-declare-inviable-el-barrio-privado-en-el-bosque-peralta-ramos/",
      },
    ],
  },
};

const resolveCaseId = () => {
  const params = new URLSearchParams(window.location.search);
  const param = params.get("case");
  if (!param) {
    return "";
  }
  const key = param.toLowerCase();
  return DEMO_CASES[key] ? key : "";
};

const state = {
  caseId: resolveCaseId(),
  caseData: null,
  map: null,
  mapMarker: null,
  mapPolygon: null,
  pendingMap: null,
  boundary: null,
  documentText: "",
  documentTextPromise: null,
};

const elements = {
  fileInput: document.getElementById("fileInput"),
  chooseFileBtn: document.getElementById("chooseFileBtn"),
  runAuditBtn: document.getElementById("runAuditBtn"),
  exportBtn: document.getElementById("exportBtn"),
  loadLawenBtn: document.getElementById("loadLawenBtn"),
  caseBadge: document.getElementById("caseBadge"),
  boundaryInput: document.getElementById("boundaryInput"),
  projectTitle: document.getElementById("projectTitle"),
  projectLocation: document.getElementById("projectLocation"),
  projectArea: document.getElementById("projectArea"),
  modelVersion: document.getElementById("modelVersion"),
  updatedAt: document.getElementById("updatedAt"),
  exposureLevel: document.getElementById("exposureLevel"),
  exposureNote: document.getElementById("exposureNote"),
  alertList: document.getElementById("alertList"),
  decisionLabel: document.getElementById("decisionLabel"),
  decisionNote: document.getElementById("decisionNote"),
  indicesBody: document.getElementById("indicesBody"),
  detailPhysical: document.getElementById("detailPhysical"),
  detailSocial: document.getElementById("detailSocial"),
  detailClimate: document.getElementById("detailClimate"),
  detailRegulatory: document.getElementById("detailRegulatory"),
  detailPolitical: document.getElementById("detailPolitical"),
  capexValue: document.getElementById("capexValue"),
  hydraulicCost: document.getElementById("hydraulicCost"),
  scenarioNote: document.getElementById("scenarioNote"),
  economicNote: document.getElementById("economicNote"),
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
  layerFlood: document.getElementById("layerFlood"),
  layerEco: document.getElementById("layerEco"),
  layerSocial: document.getElementById("layerSocial"),
  layerZoning: document.getElementById("layerZoning"),
  map: document.getElementById("map"),
  envAqi: document.getElementById("envAqi"),
  envAqiCategory: document.getElementById("envAqiCategory"),
  envPm25: document.getElementById("envPm25"),
  envPm25Units: document.getElementById("envPm25Units"),
  envTemp: document.getElementById("envTemp"),
  envFeelsLike: document.getElementById("envFeelsLike"),
  envHumidity: document.getElementById("envHumidity"),
  envCondition: document.getElementById("envCondition"),
  envNote: document.getElementById("envNote"),
  satWater: document.getElementById("satWater"),
  satWaterNote: document.getElementById("satWaterNote"),
  satLand: document.getElementById("satLand"),
  satLandNote: document.getElementById("satLandNote"),
  satHydro: document.getElementById("satHydro"),
  satHydroNote: document.getElementById("satHydroNote"),
  satVegetation: document.getElementById("satVegetation"),
  satVegetationNote: document.getElementById("satVegetationNote"),
  satSource: document.getElementById("satSource"),
  planetLast: document.getElementById("planetLast"),
  planetCount: document.getElementById("planetCount"),
  planetCloud: document.getElementById("planetCloud"),
  planetTypes: document.getElementById("planetTypes"),
  planetAvg: document.getElementById("planetAvg"),
  planetLastMonth: document.getElementById("planetLastMonth"),
  planetNote: document.getElementById("planetNote"),
  eiaProject: document.getElementById("eiaProject"),
  eiaLocation: document.getElementById("eiaLocation"),
  eiaArea: document.getElementById("eiaArea"),
  eiaDensity: document.getElementById("eiaDensity"),
  eiaLots: document.getElementById("eiaLots"),
  eiaBuffer: document.getElementById("eiaBuffer"),
  eiaWater: document.getElementById("eiaWater"),
  eiaDischarge: document.getElementById("eiaDischarge"),
  eiaNote: document.getElementById("eiaNote"),
  eiaClaimsList: document.getElementById("eiaClaimsList"),
  eiaSpecsList: document.getElementById("eiaSpecsList"),
  contradictionList: document.getElementById("contradictionList"),
  regulatoryList: document.getElementById("regulatoryList"),
  overlapList: document.getElementById("overlapList"),
  sourcesList: document.getElementById("sourcesList"),
};

const mapLayers = {
  flood: document.querySelector(".map-overlay.flood"),
  eco: document.querySelector(".map-overlay.eco"),
  social: document.querySelector(".map-overlay.social"),
  zoning: document.querySelector(".map-overlay.zoning"),
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

const CLIENT_OCR_ENABLED = new URLSearchParams(window.location.search).get("ocr") === "client";
const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.0.5/dist/tesseract.min.js";

const loadScript = (src) =>
  new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(script);
  });

let pdfjsPromise = null;
const loadPdfJs = async () => {
  if (!pdfjsPromise) {
    pdfjsPromise = loadScript(PDFJS_URL).then(() => {
      if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      }
      return window.pdfjsLib;
    });
  }
  return pdfjsPromise;
};

let tesseractPromise = null;
const loadTesseract = async () => {
  if (!tesseractPromise) {
    tesseractPromise = loadScript(TESSERACT_URL).then(() => window.Tesseract);
  }
  return tesseractPromise;
};

const extractPdfText = async (file, maxPages = null) => {
  const pdfjsLib = await loadPdfJs();
  if (!pdfjsLib) {
    throw new Error("PDF.js no disponible.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageCount = maxPages ? Math.min(pdf.numPages, maxPages) : pdf.numPages;
  let text = "";

  for (let i = 1; i <= pageCount; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(" ");
    text += `\n${pageText}`;
  }

  return { text, pdf, pageCount };
};

const runOcrOnPdf = async (pdf, pageCount, logger) => {
  const Tesseract = await loadTesseract();
  if (!Tesseract) {
    throw new Error("Tesseract no disponible.");
  }

  const worker = await Tesseract.createWorker({
    logger: (m) => logger && logger(m),
  });
  if (typeof worker.load === "function") {
    await worker.load();
  }
  await worker.loadLanguage("spa+eng");
  await worker.initialize("spa+eng");

  let text = "";
  for (let i = 1; i <= pageCount; i += 1) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;
    const result = await worker.recognize(canvas);
    text += `\n${result.data.text || ""}`;
  }

  await worker.terminate();
  return text;
};

const extractDocumentText = async (file) => {
  try {
    appendLog("Sistema", "Extrayendo texto del PDF...");
    const { text, pdf, pageCount } = await extractPdfText(file);
    const cleaned = (text || "").replace(/\s+/g, " ").trim();
    if (cleaned.length > 500) {
      appendLog("Sistema", "Texto embebido detectado.");
      return cleaned;
    }

    appendLog("Sistema", `Texto embebido insuficiente. Ejecutando OCR en ${pageCount} páginas...`);
    const ocrText = await runOcrOnPdf(pdf, pageCount, (m) => {
      if (m?.status === "recognizing text") {
        appendLog("Sistema", `OCR ${Math.round(m.progress * 100)}%`);
      }
    });
    return (ocrText || "").replace(/\s+/g, " ").trim();
  } catch (error) {
    appendLog("Sistema", `OCR falló: ${error.message}`);
    return "";
  }
};

const ensureDocumentText = async () => {
  if (state.documentTextPromise) {
    await state.documentTextPromise;
  }
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
  let color = "#2fbf71";
  if (risk >= 70) {
    color = "#d13438";
  } else if (risk >= 40) {
    color = "#f5b353";
  }
  elements.riskGauge.style.setProperty("--risk", risk);
  elements.riskGauge.style.setProperty("--risk-color", color);
};

const setKpis = (_analysis) => {
  return;
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
      elements.envNote.textContent = "Fuente: Google Air Quality & Weather";
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
  elements.envFeelsLike.textContent = Number.isFinite(feelsLike) ? `Sensación ${feelsLike}°C` : "";
  elements.envHumidity.textContent = Number.isFinite(humidity) ? `${humidity}%` : "--";
  elements.envCondition.textContent = condition || "";

  if (elements.envNote) {
    if (environment.errors && environment.errors.length) {
      elements.envNote.textContent = `Contexto parcial: ${environment.errors.join(" | ")}`;
    } else if (environment.fetchedAt) {
      elements.envNote.textContent = `Actualizado ${new Date(environment.fetchedAt).toLocaleTimeString()}`;
    }
  }
};

const setSatelliteEvidence = (evidence) => {
  if (!elements.satWater) {
    return;
  }

  if (!evidence) {
    elements.satWater.textContent = "--";
    elements.satWaterNote.textContent = "";
    elements.satLand.textContent = "--";
    elements.satLandNote.textContent = "";
    elements.satHydro.textContent = "--";
    elements.satHydroNote.textContent = "";
    elements.satVegetation.textContent = "--";
    elements.satVegetationNote.textContent = "";
    if (elements.satSource) {
      elements.satSource.textContent = "Fuente: integrar datasets satelitales.";
    }
    return;
  }

  elements.satWater.textContent = evidence.water?.value || "--";
  elements.satWaterNote.textContent = evidence.water?.detail || "";
  elements.satLand.textContent = evidence.landCover?.value || "--";
  elements.satLandNote.textContent = evidence.landCover?.detail || "";
  elements.satHydro.textContent = evidence.hydrology?.value || "--";
  elements.satHydroNote.textContent = evidence.hydrology?.detail || "";
  elements.satVegetation.textContent = evidence.vegetation?.value || "--";
  elements.satVegetationNote.textContent = evidence.vegetation?.detail || "";
  if (elements.satSource) {
    elements.satSource.textContent = evidence.source
      ? `Fuente: ${evidence.source}`
      : "Fuente: integración satelital pendiente.";
  }
};

const setPlanetSignals = (signals) => {
  if (!elements.planetLast) {
    return;
  }
  if (!signals || signals.error) {
    elements.planetLast.textContent = "--";
    elements.planetCount.textContent = "--";
    elements.planetCloud.textContent = "--";
    elements.planetTypes.textContent = "--";
    elements.planetAvg.textContent = "--";
    elements.planetLastMonth.textContent = "--";
    if (elements.planetNote) {
      elements.planetNote.textContent = signals?.error
        ? `Planet: ${signals.error}`
        : "Planet no configurado.";
    }
    return;
  }

  elements.planetLast.textContent = signals.latestAcquired
    ? new Date(signals.latestAcquired).toLocaleDateString()
    : "--";
  elements.planetCount.textContent = Number.isFinite(signals.count) ? String(signals.count) : "--";
  elements.planetCloud.textContent = Number.isFinite(signals.avgCloudCover)
    ? `${Math.round(signals.avgCloudCover * 100)}%`
    : "--";
  elements.planetTypes.textContent = Array.isArray(signals.itemTypes) ? signals.itemTypes.join(", ") : "--";
  if (signals.stats && !signals.stats.error) {
    elements.planetAvg.textContent = Number.isFinite(signals.stats.averageCount)
      ? `${signals.stats.averageCount.toFixed(1)}`
      : "--";
    elements.planetLastMonth.textContent = Number.isFinite(signals.stats.lastBucket?.count)
      ? `${signals.stats.lastBucket.count}`
      : "--";
  } else {
    elements.planetAvg.textContent = "--";
    elements.planetLastMonth.textContent = "--";
  }
  if (elements.planetNote) {
    const statsNote = signals.stats?.error ? `Stats: ${signals.stats.error}` : "";
    elements.planetNote.textContent = [signals.source || "Planet Data API", statsNote].filter(Boolean).join(" · ");
  }
};

const setEiaSummary = (eia) => {
  if (!elements.eiaProject) {
    return;
  }
  if (!eia || eia.error) {
    elements.eiaProject.textContent = "--";
    elements.eiaLocation.textContent = eia?.error ? `Error: ${eia.error}` : "--";
    elements.eiaArea.textContent = "--";
    elements.eiaDensity.textContent = "--";
    elements.eiaLots.textContent = "--";
    elements.eiaBuffer.textContent = "--";
    elements.eiaWater.textContent = "--";
    elements.eiaDischarge.textContent = "--";
    if (elements.eiaNote) {
      elements.eiaNote.textContent = eia?.error
        ? "No se pudo extraer el EIA."
        : "EIA no disponible.";
    }
    if (elements.eiaClaimsList) {
      elements.eiaClaimsList.innerHTML = "<div class=\"muted\">Sin datos.</div>";
    }
    if (elements.eiaSpecsList) {
      elements.eiaSpecsList.innerHTML = "<div class=\"muted\">Sin datos.</div>";
    }
    return;
  }

  elements.eiaProject.textContent = eia.project_name || "--";
  elements.eiaLocation.textContent = eia.location || "--";
  elements.eiaArea.textContent = Number.isFinite(eia.area_m2)
    ? `${(eia.area_m2 / 10000).toFixed(2)} ha`
    : "--";
  elements.eiaDensity.textContent = Number.isFinite(eia.density_ha)
    ? `${eia.density_ha} hab/ha`
    : "--";
  elements.eiaLots.textContent = Number.isFinite(eia.lots) ? `${eia.lots}` : "--";
  elements.eiaBuffer.textContent = Number.isFinite(eia.buffer_m) ? `Buffer ${eia.buffer_m} m` : "--";
  elements.eiaWater.textContent = Number.isFinite(eia.water_withdrawal_m3_day)
    ? `${eia.water_withdrawal_m3_day} m³/día`
    : "--";

  const dischargeLabel = eia.hydrology?.discharge_to_water === true
    ? "Descarga a cauce"
    : eia.hydrology?.discharge_to_water === false
      ? "Sin descarga reportada"
      : "--";
  elements.eiaDischarge.textContent = dischargeLabel;

  if (elements.eiaNote) {
    elements.eiaNote.textContent = eia.notes ? eia.notes : "Fuente: PDF del estudio.";
  }

  if (elements.eiaClaimsList) {
    elements.eiaClaimsList.innerHTML = eia.claims && eia.claims.length
      ? eia.claims.map((item) => `<div class="pill">${item}</div>`).join("")
      : "<div class=\"muted\">Sin claims detectados.</div>";
  }
  if (elements.eiaSpecsList) {
    elements.eiaSpecsList.innerHTML = eia.specs && eia.specs.length
      ? eia.specs.map((item) => `<div class="pill">${item}</div>`).join("")
      : "<div class=\"muted\">Sin specs detectados.</div>";
  }
};

const renderContradictions = (contradictions) => {
  if (!elements.contradictionList) {
    return;
  }
  if (!contradictions || contradictions.length === 0) {
    elements.contradictionList.innerHTML = "<div class=\"muted\">Sin contradicciones detectadas.</div>";
    return;
  }

  elements.contradictionList.innerHTML = contradictions
    .map((item) => {
      const severity = item.severity || "Media";
      const severityClass = severity === "Bloqueante" || severity === "Alta" ? "block" : "warn";
      return `
        <div class="alert-item ${severityClass}">
          <strong>${item.type || "EIA"}</strong>
          <span>${item.message || ""}</span>
        </div>
      `;
    })
    .join("");
};

const setRegulatoryAnchors = (analysis) => {
  if (!elements.regulatoryList || !elements.overlapList) {
    return;
  }

  const anchors = analysis?.regulatoryRefs || [];
  const overlaps = analysis?.overlaps || [];

  elements.regulatoryList.innerHTML = anchors.length
    ? anchors.map((item) => `<div class="pill">${item}</div>`).join("")
    : "<div class=\"muted\">Sin referencias cargadas.</div>";

  elements.overlapList.innerHTML = overlaps.length
    ? overlaps.map((item) => `<div class="pill warn">${item.type}: ${item.name}</div>`).join("")
    : "<div class=\"muted\">Sin solapamientos detectados.</div>";
};

const setSources = (sources) => {
  if (!elements.sourcesList) {
    return;
  }

  if (!sources || sources.length === 0) {
    elements.sourcesList.innerHTML = "<div class=\"muted\">Sin fuentes cargadas.</div>";
    return;
  }

  elements.sourcesList.innerHTML = sources
    .map(
      (source) =>
        `<a href="${source.url}" target="_blank" rel="noreferrer">${source.title}</a>`
    )
    .join("");
};

const extractPolygonFromGeoJSON = (geojson) => {
  if (!geojson) {
    return null;
  }
  if (geojson.type === "FeatureCollection" && Array.isArray(geojson.features)) {
    return extractPolygonFromGeoJSON(geojson.features[0]?.geometry);
  }
  if (geojson.type === "Feature") {
    return extractPolygonFromGeoJSON(geojson.geometry);
  }
  if (geojson.type === "Polygon") {
    return geojson.coordinates?.[0] || null;
  }
  if (geojson.type === "MultiPolygon") {
    return geojson.coordinates?.[0]?.[0] || null;
  }
  return null;
};

const parseGeoJSONBoundary = (text) => {
  try {
    const parsed = JSON.parse(text);
    const ring = extractPolygonFromGeoJSON(parsed);
    if (!ring) {
      return null;
    }
    const coords = ring.map(([lng, lat]) => ({ lat, lng }));
    return { geojson: parsed, coords };
  } catch (error) {
    return null;
  }
};

const parseKmlBoundary = (text) => {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "text/xml");
  const coordNode = xml.querySelector("Polygon coordinates, LinearRing coordinates, coordinates");
  if (!coordNode) {
    return null;
  }
  const raw = coordNode.textContent || "";
  const points = raw
    .trim()
    .split(/\s+/)
    .map((entry) => entry.split(",").map(Number))
    .filter((parts) => parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]))
    .map(([lng, lat]) => ({ lat, lng }));

  if (points.length < 3) {
    return null;
  }

  const geojson = {
    type: "Polygon",
    coordinates: [[...points, points[0]].map((point) => [point.lng, point.lat])],
  };

  return { geojson, coords: points };
};

const computeCentroid = (points) => {
  if (!points || points.length === 0) {
    return null;
  }
  let latSum = 0;
  let lngSum = 0;
  for (const point of points) {
    latSum += point.lat;
    lngSum += point.lng;
  }
  return { lat: latSum / points.length, lng: lngSum / points.length };
};

const handleBoundaryFile = (file) => {
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = (event) => {
    const text = String(event.target.result || "");
    let parsed = null;
    if (file.name.toLowerCase().endsWith(".kml")) {
      parsed = parseKmlBoundary(text);
    } else {
      parsed = parseGeoJSONBoundary(text);
    }
    if (!parsed) {
      appendLog("Sistema", "No se pudo leer el polígono. Verifica el archivo.");
      return;
    }
    state.boundary = parsed.geojson;
    const center = computeCentroid(parsed.coords) || parsed.coords[0];
    elements.lat.value = center.lat.toFixed(5);
    elements.lng.value = center.lng.toFixed(5);
    updateMap({ center, polygon: parsed.coords });
    setProjectMeta({
      name: elements.projectName.value || state.caseData?.name || "",
      coordinates: center,
      area: state.caseData?.area_m2,
      updatedAt: new Date().toISOString(),
    });
    appendLog("Sistema", "Polígono cargado correctamente.");
  };
  reader.readAsText(file);
};

const formatLatLng = (coords) => {
  if (!coords) {
    return "--";
  }
  return `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
};

const formatArea = (areaMeters) => {
  if (!Number.isFinite(areaMeters)) {
    return "--";
  }
  const hectares = areaMeters / 10000;
  return `${hectares.toFixed(1)} ha`;
};

const setProjectMeta = ({ name, coordinates, area, updatedAt }) => {
  if (elements.projectTitle) {
    elements.projectTitle.textContent = name || "Sin definir";
  }
  if (elements.projectLocation) {
    elements.projectLocation.textContent = formatLatLng(coordinates);
  }
  if (elements.projectArea) {
    elements.projectArea.textContent = formatArea(area);
  }
  if (elements.updatedAt) {
    elements.updatedAt.textContent = updatedAt ? new Date(updatedAt).toLocaleDateString() : "--";
  }
};

const getLevelLabel = (score) => {
  if (score >= 70) {
    return "Riesgo alto";
  }
  if (score >= 40) {
    return "Riesgo medio";
  }
  return "Riesgo bajo";
};

const renderIndices = (indices) => {
  if (!elements.indicesBody) {
    return;
  }
  if (!indices || indices.length === 0) {
    elements.indicesBody.innerHTML = "<div class=\"muted\">Sin índices cargados.</div>";
    return;
  }

  elements.indicesBody.innerHTML = indices
    .map((item) => {
      const barWidth = Math.max(0, Math.min(100, item.score));
      return `
      <div class="indices-row">
        <span class="index-name">${item.label}</span>
        <span class="index-score">
          ${item.score}
          <span class="index-bar"><span style="width:${barWidth}%"></span></span>
        </span>
        <span class="index-level">${item.level}</span>
        <span class="index-mitigability">${item.mitigability}</span>
      </div>
      `;
    })
    .join("");
};

const renderAlerts = (alerts) => {
  if (!elements.alertList) {
    return;
  }
  if (!alerts || alerts.length === 0) {
    elements.alertList.innerHTML = "<div class=\"muted\">Sin alertas críticas.</div>";
    return;
  }

  elements.alertList.innerHTML = alerts
    .map((alert) => {
      const severity = alert.severity || "Media";
      const severityClass = severity === "Bloqueante" || severity === "Alta" ? "block" : "warn";
      return `
        <div class="alert-item ${severityClass}">
          <strong>${alert.type}</strong>
          <span>${alert.message}</span>
        </div>
      `;
    })
    .join("");
};

const setDecision = (decision) => {
  if (!elements.decisionLabel) {
    return;
  }
  if (!decision) {
    elements.decisionLabel.textContent = "Pendiente";
    if (elements.decisionNote) {
      elements.decisionNote.textContent = "Completa la auditoría para una recomendación.";
    }
    return;
  }
  elements.decisionLabel.textContent = decision.label;
  if (elements.decisionNote) {
    elements.decisionNote.textContent = decision.note || "";
  }
};

const setExecutiveSummary = (analysis) => {
  if (!analysis) {
    setGauge(0);
    if (elements.exposureLevel) {
      elements.exposureLevel.textContent = "Riesgo bajo";
    }
    if (elements.exposureNote) {
      elements.exposureNote.textContent = "Ejecuta el radar para calcular exposición.";
    }
    renderIndices(null);
    renderAlerts(null);
    setDecision(null);
    return;
  }

  const executive = analysis.executive;
  const score = executive?.exposureScore ?? analysis.riskScore ?? 0;
  setGauge(score);

  if (elements.exposureLevel) {
    elements.exposureLevel.textContent = executive?.exposureLevel || getLevelLabel(score);
  }
  if (elements.exposureNote) {
    elements.exposureNote.textContent = executive?.summary || "Exposición calculada con ICET.";
  }

  renderIndices(executive?.indices);
  renderAlerts(executive?.alerts);
  setDecision(executive?.decision);

  if (elements.detailPhysical) {
    elements.detailPhysical.textContent = executive?.details?.physical || "Pendiente de evaluación.";
  }
  if (elements.detailSocial) {
    elements.detailSocial.textContent = executive?.details?.social || "Pendiente de evaluación.";
  }
  if (elements.detailClimate) {
    elements.detailClimate.textContent = executive?.details?.climate || "Pendiente de evaluación.";
  }
  if (elements.detailRegulatory) {
    elements.detailRegulatory.textContent = executive?.details?.regulatory || "Pendiente de evaluación.";
  }
  if (elements.detailPolitical) {
    elements.detailPolitical.textContent = executive?.details?.political || "Pendiente de evaluación.";
  }

  if (elements.capexValue) {
    elements.capexValue.textContent = executive?.economic?.capex || "--";
  }
  if (elements.hydraulicCost) {
    elements.hydraulicCost.textContent = executive?.economic?.hydraulic || "--";
  }
  if (elements.scenarioNote) {
    elements.scenarioNote.textContent = executive?.economic?.scenario || "--";
  }
  if (elements.economicNote && executive?.economic?.note) {
    elements.economicNote.textContent = executive.economic.note;
  }
};

const metersToLat = (meters) => meters / 111320;
const metersToLng = (meters, lat) =>
  meters / (111320 * Math.cos((lat * Math.PI) / 180));

const solveRectangle = (area, perimeter) => {
  if (!Number.isFinite(area) || !Number.isFinite(perimeter) || area <= 0 || perimeter <= 0) {
    return { width: 0, height: 0 };
  }
  const semi = perimeter / 2;
  const disc = Math.max(0, semi * semi - 4 * area);
  const width = (semi + Math.sqrt(disc)) / 2;
  const height = semi - width;
  return width >= height ? { width, height } : { width: height, height: width };
};

const buildRectanglePolygon = ({ center, area, perimeter }) => {
  if (!center || !Number.isFinite(area) || !Number.isFinite(perimeter)) {
    return null;
  }
  const { width, height } = solveRectangle(area, perimeter);
  if (!width || !height) {
    return null;
  }

  const latHalf = metersToLat(height / 2);
  const lngHalf = metersToLng(width / 2, center.lat);
  return [
    { lat: center.lat + latHalf, lng: center.lng - lngHalf },
    { lat: center.lat + latHalf, lng: center.lng + lngHalf },
    { lat: center.lat - latHalf, lng: center.lng + lngHalf },
    { lat: center.lat - latHalf, lng: center.lng - lngHalf },
    { lat: center.lat + latHalf, lng: center.lng - lngHalf },
  ];
};

const updateMap = ({ center, polygon }) => {
  if (!center) {
    return;
  }

  state.pendingMap = { center, polygon };
  if (!state.map || !window.google?.maps) {
    return;
  }

  state.map.setCenter(center);
  state.map.setZoom(15);

  if (state.mapMarker) {
    state.mapMarker.setMap(null);
  }
  state.mapMarker = new window.google.maps.Marker({
    position: center,
    map: state.map,
    title: "Proyecto",
  });

  if (state.mapPolygon) {
    state.mapPolygon.setMap(null);
  }
  if (polygon) {
    state.mapPolygon = new window.google.maps.Polygon({
      paths: polygon,
      strokeColor: "#7ef29d",
      strokeOpacity: 0.7,
      strokeWeight: 2,
      fillColor: "#7ef29d",
      fillOpacity: 0.15,
    });
    state.mapPolygon.setMap(state.map);
    const bounds = new window.google.maps.LatLngBounds();
    polygon.forEach((point) => bounds.extend(point));
    state.map.fitBounds(bounds);
  }

  const placeholder = elements.map.querySelector(".map-placeholder");
  if (placeholder) {
    placeholder.style.display = "none";
  }
};

const applyCase = (caseData) => {
  if (!caseData) {
    return;
  }
  state.caseId = caseData.id;
  state.caseData = caseData;
  state.boundary = null;
  elements.projectName.value = caseData.name;
  elements.industry.value = caseData.industry;
  elements.scenario.value = caseData.scenario;
  elements.lat.value = caseData.coordinates.lat;
  elements.lng.value = caseData.coordinates.lng;
  elements.claims.value = caseData.claims;
  elements.specs.value = caseData.specs;

  if (elements.caseBadge) {
    elements.caseBadge.textContent = `Caso demo: ${caseData.name}`;
  }

  setSources(caseData.sources);
  setProjectMeta({
    name: caseData.name,
    coordinates: caseData.coordinates,
    area: caseData.area_m2,
    updatedAt: new Date().toISOString(),
  });

  const polygon = buildRectanglePolygon({
    center: caseData.coordinates,
    area: caseData.area_m2,
    perimeter: caseData.perimeter_m,
  });
  updateMap({ center: caseData.coordinates, polygon });
};

const getCoordinatesFromForm = () => {
  const lat = Number(elements.lat.value);
  const lng = Number(elements.lng.value);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }
  return { lat, lng };
};

const refreshMapFromForm = () => {
  const coords = getCoordinatesFromForm();
  if (!coords) {
    return;
  }
  let polygon = null;
  if (state.boundary) {
    const ring = extractPolygonFromGeoJSON(state.boundary);
    if (ring) {
      polygon = ring.map(([lng, lat]) => ({ lat, lng }));
    }
  } else if (state.caseData) {
    polygon = buildRectanglePolygon({
      center: coords,
      area: state.caseData.area_m2,
      perimeter: state.caseData.perimeter_m,
    });
  }
  updateMap({ center: coords, polygon });
  setProjectMeta({
    name: elements.projectName.value || state.caseData?.name || "",
    coordinates: coords,
    area: state.caseData?.area_m2,
    updatedAt: new Date().toISOString(),
  });
};

const setLoading = (loading) => {
  elements.runAuditBtn.disabled = loading;
  elements.runAuditBtn.textContent = loading ? "Ejecutando..." : "Ejecutar radar";
};

const updateResultSummary = (_analysis) => {
  return;
};

const buildRoadmap = (analysis) => {
  if (!analysis) {
    return "Ejecuta una auditoría para generar la hoja de corrección.";
  }

  const lines = [
    "Hoja de Corrección",
    "===================",
    `Proyecto: ${elements.projectName.value || "Sin título"}`,
    `Industria: ${elements.industry.value}`,
    `Escenario: ${elements.scenario.value}`,
    `Decisión sugerida: ${analysis.executive?.decision?.label || "Pendiente"}`,
    "",
    "Acciones prioritarias:",
    `1. Verificar claims: ${analysis.inconsistency?.claimed || "N/A"}`,
    "2. Alinear specs con límites ambientales.",
    `3. Revisar normativa: ${(analysis.regulatoryRefs || []).join("; ")}`,
    `4. Resolver conflictos geoespaciales: ${analysis.zoneSummary || "Sin cruces detectados."}`,
    `5. Completar evidencia satelital: ${analysis.satelliteEvidence?.source || "Integrar datasets satelitales."}`,
    "",
    "Checklist de entrega:",
    "- Impacto actualizado",
    "- Plan de mitigación",
    "- Evidencia documental",
  ];

  return lines.join("\n");
};

const updateUI = (analysis) => {
  if (!analysis) {
    return;
  }

  setExecutiveSummary(analysis);
  setEnvironment(analysis.environment);
  setSatelliteEvidence(analysis.satelliteEvidence);
  setPlanetSignals(analysis.planetSignals);
  setEiaSummary(analysis.eia);
  renderContradictions(analysis.contradictions);
  setRegulatoryAnchors(analysis);
  setProjectMeta({
    name: elements.projectName.value || state.caseData?.name || "",
    coordinates: getCoordinatesFromForm(),
    area: state.caseData?.area_m2,
    updatedAt: analysis.executive?.updatedAt || new Date().toISOString(),
  });

  if (analysis.llmSummary) {
    appendLog("GPT", analysis.llmSummary);
  }
};

const createProject = async () => {
  await ensureDocumentText();
  const formData = new FormData();
  formData.append("name", elements.projectName.value || "");
  formData.append("industry", elements.industry.value || "");
  formData.append("scenario", elements.scenario.value || "");
  formData.append("lat", elements.lat.value || "");
  formData.append("lng", elements.lng.value || "");
  formData.append("claims", elements.claims.value || "");
  formData.append("specs", elements.specs.value || "");
  formData.append("caseId", state.caseId || "");
  if (state.documentText) {
    formData.append("documentText", state.documentText);
  }
  if (state.boundary) {
    formData.append("boundary", JSON.stringify(state.boundary));
  }
  if (selectedFile) {
    formData.append("file", selectedFile);
  }

  const response = await fetch(`${API_BASE_URL}/api/projects`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Error al crear el proyecto.");
  }

  const payload = await response.json();
  return payload.project;
};

const createAudit = async (projectId) => {
  const payload = { projectId, caseId: state.caseId || "" };
  if (!projectId) {
    payload.projectName = elements.projectName.value || "";
    payload.industry = elements.industry.value || "";
    payload.scenario = elements.scenario.value || "";
    payload.lat = elements.lat.value || "";
    payload.lng = elements.lng.value || "";
    payload.claims = elements.claims.value || "";
    payload.specs = elements.specs.value || "";
  }
  if (state.boundary) {
    payload.boundary = state.boundary;
  }
  const response = await fetch(`${API_BASE_URL}/api/audits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Error al ejecutar la auditoría.");
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
      appendLog("Sistema", "Stream no disponible. Reproduciendo logs.");
      const fallback = audit.logs.map((log) => ({ ...log, delay: 240 }));
      enqueueLogs(fallback, () => {
        updateUI(audit.analysis);
        if (onComplete) {
          onComplete();
        }
      });
      return;
    }

    appendLog("Sistema", "Stream interrumpido.");
    updateUI(audit.analysis);
    if (onComplete) {
      onComplete();
    }
  };
};

const runAudit = async () => {
  setLoading(true);
  resetTerminal();
  appendLog("Sistema", `Conectando a ${API_BASE_URL}...`);
  refreshMapFromForm();

  try {
    const project = await createProject();
    appendLog("Sistema", `Proyecto creado: ${project.id}.`);
    const audit = await createAudit(project.id);
    lastAnalysis = audit.analysis;
    streamAudit(audit, () => setLoading(false));
  } catch (error) {
    appendLog("Sistema", `Error: ${error.message}`);
    setLoading(false);
  }
};

const exportRoadmap = () => {
  const roadmap = buildRoadmap(lastAnalysis);
  const roadmapWindow = window.open("", "_blank");

  if (!roadmapWindow) {
    alert("El navegador bloqueó la ventana emergente.");
    return;
  }

  const html = `
    <!doctype html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <title>Hoja de Corrección</title>
      <style>
        body { font-family: "Space Grotesk", Arial, sans-serif; padding: 32px; }
        h1 { margin-top: 0; }
        pre { white-space: pre-wrap; font-size: 14px; }
      </style>
    </head>
    <body>
      <h1>Hoja de Corrección</h1>
      <pre>${roadmap.replace(/</g, "&lt;")}</pre>
      <p>Usa la opción Imprimir para guardar PDF.</p>
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
  state.documentText = "";
  state.documentTextPromise = null;

  if (file.type === "text/plain") {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const trimmed = String(text || "").slice(0, 12000);
      elements.claims.value = trimmed.slice(0, 1200);
      state.documentText = trimmed;
    };
    reader.readAsText(file);
    return;
  }

  if (file.type === "application/pdf") {
    if (CLIENT_OCR_ENABLED) {
      state.documentTextPromise = extractDocumentText(file).then((text) => {
        if (text) {
          state.documentText = text.slice(0, 12000);
        }
      });
    } else {
      appendLog("Sistema", "OCR se ejecutará en backend al correr el radar.");
    }
  }
};

const toggleLayer = (layer, visible) => {
  if (!layer) {
    return;
  }
  layer.classList.toggle("hidden", !visible);
};

const initLayerControls = () => {
  if (elements.layerFlood) {
    elements.layerFlood.addEventListener("change", (event) => {
      toggleLayer(mapLayers.flood, event.target.checked);
    });
  }
  if (elements.layerEco) {
    elements.layerEco.addEventListener("change", (event) => {
      toggleLayer(mapLayers.eco, event.target.checked);
    });
  }
  if (elements.layerSocial) {
    elements.layerSocial.addEventListener("change", (event) => {
      toggleLayer(mapLayers.social, event.target.checked);
    });
  }
  if (elements.layerZoning) {
    elements.layerZoning.addEventListener("change", (event) => {
      toggleLayer(mapLayers.zoning, event.target.checked);
    });
  }
};

const initMap = () => {
  if (!GMAPS_API_KEY) {
    return;
  }

  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_API_KEY}`;
  script.async = true;
  script.onload = () => {
    const fallbackCenter = { lat: 37.7749, lng: -122.4194 };
    const center = state.pendingMap?.center || state.caseData?.coordinates || getCoordinatesFromForm() || fallbackCenter;
    state.map = new window.google.maps.Map(elements.map, {
      center,
      zoom: 12,
      mapTypeId: "satellite",
      mapTypeControl: false,
      fullscreenControl: false,
      streetViewControl: false,
    });

    if (state.pendingMap) {
      const pending = state.pendingMap;
      state.pendingMap = null;
      updateMap(pending);
      return;
    }

    const polygon = state.caseData
      ? buildRectanglePolygon({
          center,
          area: state.caseData.area_m2,
          perimeter: state.caseData.perimeter_m,
        })
      : null;
    updateMap({ center, polygon });
  };
  document.body.appendChild(script);
};

const bindEvents = () => {
  elements.chooseFileBtn.addEventListener("click", () => elements.fileInput.click());
  elements.fileInput.addEventListener("change", (event) => handleFile(event.target.files[0]));
  if (elements.boundaryInput) {
    elements.boundaryInput.addEventListener("change", (event) => handleBoundaryFile(event.target.files[0]));
  }
  elements.runAuditBtn.addEventListener("click", runAudit);
  elements.exportBtn.addEventListener("click", exportRoadmap);
  if (elements.loadLawenBtn) {
    elements.loadLawenBtn.addEventListener("click", () => applyCase(DEMO_CASES.lawen));
  }
};

initLayerControls();
bindEvents();
if (state.caseId && DEMO_CASES[state.caseId]) {
  applyCase(DEMO_CASES[state.caseId]);
} else if (elements.caseBadge) {
  elements.caseBadge.textContent = "Caso demo: ninguno";
}
initMap();
setExecutiveSummary(null);
setEnvironment(null);
setSatelliteEvidence(null);
setPlanetSignals(null);
setEiaSummary(null);
renderContradictions(null);
setRegulatoryAnchors(null);
setSources(null);
setProjectMeta({
  name: elements.projectName?.value || "",
  coordinates: getCoordinatesFromForm(),
  area: state.caseData?.area_m2,
  updatedAt: null,
});
