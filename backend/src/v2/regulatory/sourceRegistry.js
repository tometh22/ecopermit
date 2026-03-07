const fs = require("fs");
const path = require("path");

const REGULATORY_SOURCES_JSON = process.env.REGULATORY_SOURCES_JSON || "";
const REGULATORY_SOURCES_FILE = process.env.REGULATORY_SOURCES_FILE || "";
const REGULATORY_MIN_HEALTHY_SOURCES = Number(process.env.REGULATORY_MIN_HEALTHY_SOURCES || 2);
const REGULATORY_ENABLE_DEMO_SOURCES = String(process.env.REGULATORY_ENABLE_DEMO_SOURCES || "").toLowerCase() === "true";

const DEMO_SOURCES = [
  {
    id: "demo-lawen-bosque",
    name: "Bosque Peralta Ramos (demo local)",
    authority: "Demo catalog",
    jurisdiction: "AR-B-MDP",
    type: "Bosque protegido",
    legalRef: "Ley 13.273 (referencia demo)",
    kind: "inline_geojson",
    critical: false,
    data: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "Bosque Peralta Ramos" },
          geometry: {
            type: "Polygon",
            coordinates: [[
              [-57.605, -38.105],
              [-57.56, -38.105],
              [-57.56, -38.065],
              [-57.605, -38.065],
              [-57.605, -38.105],
            ]],
          },
        },
      ],
    },
  },
  {
    id: "demo-lawen-arroyo",
    name: "Arroyo Corrientes (demo local)",
    authority: "Demo catalog",
    jurisdiction: "AR-B-MDP",
    type: "Curso de agua",
    legalRef: "Franja de protección hídrica 15m (referencia demo)",
    kind: "inline_geojson",
    critical: false,
    data: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "Arroyo Corrientes" },
          geometry: {
            type: "Polygon",
            coordinates: [[
              [-57.595, -38.1],
              [-57.565, -38.1],
              [-57.565, -38.07],
              [-57.595, -38.07],
              [-57.595, -38.1],
            ]],
          },
        },
      ],
    },
  },
];

const DEFAULT_SOURCES = [
  {
    id: "official-wetlands",
    name: "Inventario oficial de humedales",
    authority: "Autoridad ambiental",
    jurisdiction: "configurable",
    type: "Humedales",
    legalRef: "Protección de humedales y áreas sensibles",
    kind: "geojson_url",
    url: process.env.REG_WETLANDS_URL || "",
    critical: true,
  },
  {
    id: "official-protected-areas",
    name: "Áreas protegidas oficiales",
    authority: "Autoridad de áreas protegidas",
    jurisdiction: "configurable",
    type: "Área protegida",
    legalRef: "Régimen de áreas protegidas",
    kind: "geojson_url",
    url: process.env.REG_PROTECTED_URL || "",
    critical: true,
  },
  {
    id: "official-hydro-network",
    name: "Red hidrográfica oficial",
    authority: "Autoridad hídrica",
    jurisdiction: "configurable",
    type: "Curso de agua",
    legalRef: "Código hídrico y franjas de protección",
    kind: "geojson_url",
    url: process.env.REG_HYDRO_URL || "",
    critical: true,
  },
];

const parseJson = (raw) => {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
};

const normalizeSource = (source, index) => {
  if (!source || typeof source !== "object") {
    return null;
  }

  const id = String(source.id || `source-${index + 1}`).trim();
  if (!id) {
    return null;
  }

  const kind = String(source.kind || "geojson_url").toLowerCase();

  return {
    id,
    name: String(source.name || id),
    authority: String(source.authority || "No especificada"),
    jurisdiction: String(source.jurisdiction || "No especificada"),
    type: String(source.type || "Restricción"),
    legalRef: String(source.legalRef || ""),
    citationUrl: source.citationUrl ? String(source.citationUrl) : "",
    kind,
    url: source.url ? String(source.url) : "",
    critical: Boolean(source.critical),
    timeoutMs: Number(source.timeoutMs) || null,
    headers: source.headers && typeof source.headers === "object" ? source.headers : null,
    bboxQueryParam: source.bboxQueryParam ? String(source.bboxQueryParam) : "",
    bboxFormat: source.bboxFormat ? String(source.bboxFormat) : "",
    retryWithoutBbox: source.retryWithoutBbox !== false,
    data: source.data && typeof source.data === "object" ? source.data : null,
    enabled: source.enabled !== false,
  };
};

const readSourcesFile = (filePath) => {
  if (!filePath) {
    return null;
  }

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);

  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(absolutePath, "utf8");
    return parseJson(raw);
  } catch (_error) {
    return null;
  }
};

const resolveRawSources = () => {
  const fromEnv = parseJson(REGULATORY_SOURCES_JSON);
  if (Array.isArray(fromEnv)) {
    return fromEnv;
  }

  const fromFile = readSourcesFile(REGULATORY_SOURCES_FILE);
  if (Array.isArray(fromFile)) {
    return fromFile;
  }

  return DEFAULT_SOURCES;
};

const getSourceRegistryWithOptions = ({ includeDisabled = false } = {}) => {
  const raw = resolveRawSources();
  const mergedRaw = REGULATORY_ENABLE_DEMO_SOURCES ? [...raw, ...DEMO_SOURCES] : raw;
  const sources = mergedRaw
    .map((item, index) => normalizeSource(item, index))
    .filter(Boolean);
  return includeDisabled ? sources : sources.filter((item) => item.enabled);
};

const getSourceRegistry = () => getSourceRegistryWithOptions();

const getRegistryConfig = () => ({
  minHealthySources: Number.isFinite(REGULATORY_MIN_HEALTHY_SOURCES)
    ? REGULATORY_MIN_HEALTHY_SOURCES
    : 2,
});

module.exports = {
  getSourceRegistry,
  getSourceRegistryWithOptions,
  getRegistryConfig,
};
