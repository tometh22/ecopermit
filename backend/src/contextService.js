const GOOGLE_ENV_API_KEY = process.env.GOOGLE_ENV_API_KEY || "";
const GOOGLE_ENV_CACHE_MS = Number(process.env.GOOGLE_ENV_CACHE_MS || 10 * 60 * 1000);

const AIR_QUALITY_ENDPOINT = "https://airquality.googleapis.com/v1/currentConditions:lookup";
const WEATHER_ENDPOINT = "https://weather.googleapis.com/v1/currentConditions:lookup";

const cache = new Map();

const getCacheKey = (coords) => {
  if (!coords) {
    return null;
  }
  return `${coords.lat.toFixed(3)}:${coords.lng.toFixed(3)}`;
};

const getFromCache = (coords) => {
  const key = getCacheKey(coords);
  if (!key) {
    return null;
  }
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
};

const setCache = (coords, value) => {
  if (!GOOGLE_ENV_CACHE_MS) {
    return;
  }
  const key = getCacheKey(coords);
  if (!key) {
    return;
  }
  cache.set(key, {
    value,
    expiresAt: Date.now() + GOOGLE_ENV_CACHE_MS,
  });
};

const fetchAirQuality = async (coords) => {
  if (!GOOGLE_ENV_API_KEY || !coords) {
    return null;
  }

  const response = await fetch(`${AIR_QUALITY_ENDPOINT}?key=${GOOGLE_ENV_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: {
        latitude: coords.lat,
        longitude: coords.lng,
      },
      extraComputations: [
        "DOMINANT_POLLUTANT_CONCENTRATION",
        "POLLUTANT_CONCENTRATION",
      ],
      languageCode: "en",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Air Quality API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const index =
    data.indexes?.find((item) => item.code === "uaqi") ||
    data.indexes?.find((item) => item.code === "usa_epa") ||
    data.indexes?.[0];
  const pm25 = data.pollutants?.find((item) => item.code === "pm25");

  return {
    aqi: index?.aqi ?? null,
    category: index?.category ?? null,
    dominantPollutant: index?.dominantPollutant ?? null,
    pm25: pm25?.concentration?.value ?? null,
    pm25Units: pm25?.concentration?.units ?? null,
  };
};

const fetchWeather = async (coords) => {
  if (!GOOGLE_ENV_API_KEY || !coords) {
    return null;
  }

  const url = new URL(WEATHER_ENDPOINT);
  url.searchParams.set("key", GOOGLE_ENV_API_KEY);
  url.searchParams.set("location.latitude", coords.lat);
  url.searchParams.set("location.longitude", coords.lng);
  url.searchParams.set("unitsSystem", "METRIC");

  const response = await fetch(url.toString(), { method: "GET" });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Weather API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const windSpeed = data.wind?.speed?.value ?? data.wind?.speed ?? null;
  const windUnit = data.wind?.speed?.unit ?? data.wind?.speed?.units ?? null;

  return {
    temperatureC: data.temperature?.degrees ?? null,
    feelsLikeC: data.feelsLikeTemperature?.degrees ?? null,
    humidity: data.relativeHumidity ?? null,
    condition: data.weatherCondition?.description?.text ?? null,
    windSpeed,
    windUnit,
  };
};

const computeContextRiskAdjustment = (aqi) => {
  if (!Number.isFinite(aqi)) {
    return 0;
  }
  if (aqi >= 201) {
    return 10;
  }
  if (aqi >= 151) {
    return 8;
  }
  if (aqi >= 101) {
    return 5;
  }
  if (aqi <= 50) {
    return -2;
  }
  return 0;
};

const fetchEnvironmentalContext = async (coords) => {
  if (!coords || !GOOGLE_ENV_API_KEY) {
    return null;
  }

  const cached = getFromCache(coords);
  if (cached) {
    return cached;
  }

  const [airQualityResult, weatherResult] = await Promise.allSettled([
    fetchAirQuality(coords),
    fetchWeather(coords),
  ]);

  const airQuality = airQualityResult.status === "fulfilled" ? airQualityResult.value : null;
  const weather = weatherResult.status === "fulfilled" ? weatherResult.value : null;
  const errors = [];

  if (airQualityResult.status === "rejected") {
    errors.push(airQualityResult.reason?.message || "Air Quality API failed.");
  }
  if (weatherResult.status === "rejected") {
    errors.push(weatherResult.reason?.message || "Weather API failed.");
  }

  const riskAdjustment = computeContextRiskAdjustment(airQuality?.aqi ?? null);
  const context = {
    airQuality,
    weather,
    riskAdjustment,
    fetchedAt: new Date().toISOString(),
    errors,
  };

  setCache(coords, context);
  return context;
};

module.exports = {
  fetchEnvironmentalContext,
};
