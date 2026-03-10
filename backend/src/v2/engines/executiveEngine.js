const SEVERITY_ORDER = {
  Bloqueante: 4,
  Alta: 3,
  Media: 2,
  Baja: 1,
};

const topAlerts = (alerts, limit = 5) => {
  return [...alerts]
    .sort((a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0))
    .slice(0, limit);
};

const buildAlerts = ({
  contradictions,
  overlaps,
  territorialSignals,
  planetSignals,
  environment,
  regulatorySignals,
  evidenceQuality,
}) => {
  const alerts = [];

  contradictions.forEach((item) => {
    alerts.push({
      type: item.type,
      message: item.message,
      severity: item.severity,
      legalBasis: item.legalBasis || [],
    });
  });

  if (overlaps.length) {
    alerts.push({
      type: "Geoespacial",
      message: `${overlaps.length} solapamientos en zonas sensibles/restringidas.`,
      severity: overlaps.length > 1 ? "Alta" : "Media",
      legalBasis: overlaps.map((item) => item.law).filter(Boolean).slice(0, 3),
    });
  }

  if (territorialSignals?.summary?.wetlands > 0) {
    alerts.push({
      type: "Humedales",
      message: "Se detectan humedales en área de análisis (OSM/Overpass).",
      severity: "Alta",
    });
  }

  if (Number.isFinite(planetSignals?.avgCloudCover) && planetSignals.avgCloudCover > 0.6) {
    alerts.push({
      type: "Satelital",
      message: "Nubosidad alta en escenas recientes; revisar ventana temporal.",
      severity: "Media",
    });
  }

  if (Number.isFinite(environment?.airQuality?.aqi) && environment.airQuality.aqi > 150) {
    alerts.push({
      type: "Ambiental",
      message: `AQI elevado (${environment.airQuality.aqi}).`,
      severity: "Media",
    });
  }

  if (!regulatorySignals?.coverage?.isSufficient) {
    const missing = regulatorySignals?.coverage?.missingCritical || [];
    alerts.push({
      type: "Validez regulatoria",
      message: missing.length
        ? `Fuentes críticas pendientes: ${missing.join(", ")}.`
        : "Fuentes regulatorias insuficientes para decisión concluyente.",
      severity: "Bloqueante",
      legalBasis: ["Gate de suficiencia regulatoria"],
    });
  }

  if ((evidenceQuality?.score || 0) < 55) {
    alerts.push({
      type: "Calidad probatoria",
      message: `Calidad de evidencia ${evidenceQuality.score}/100 (${evidenceQuality.level}).`,
      severity: "Alta",
    });
  }

  return topAlerts(alerts, 5);
};

module.exports = {
  buildAlerts,
};
