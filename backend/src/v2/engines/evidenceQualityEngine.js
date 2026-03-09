const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const bandFromScore = (score) => {
  if (score >= 75) {
    return "Alta";
  }
  if (score >= 45) {
    return "Media";
  }
  return "Baja";
};

const toPct = (value) => Math.round(clamp(value, 0, 1) * 100);

const computeEvidenceQuality = ({
  regulatorySignals,
  eia,
  satellite,
  environment,
  contradictions,
}) => {
  const coverage = regulatorySignals?.coverage || {};
  const sources = regulatorySignals?.sources || [];
  const geoSources = sources.filter((item) => !item.referenceOnly);
  const healthyGeo = Number(coverage.healthySources || 0);
  const geoCoverageRatio = geoSources.length ? healthyGeo / geoSources.length : 0;
  const criticalRequired = Number(coverage.criticalRequired || 0);
  const criticalHealthy = Number(coverage.criticalHealthy || 0);
  const criticalCoverageRatio = criticalRequired ? criticalHealthy / criticalRequired : 1;

  const textualSignal = (eia?.claims?.length || 0) + (eia?.specs?.length || 0) + (eia?.mitigations?.length || 0);
  const eiaRatio = eia?.error ? 0.2 : clamp(textualSignal / 8, 0.25, 1);

  const scenesScore = Number.isFinite(satellite?.planetSignals?.count) ? clamp(satellite.planetSignals.count / 20, 0.2, 1) : 0.25;
  const processingScore = satellite?.processingSignals?.error ? 0.2 : 0.8;
  const satelliteRatio = (scenesScore * 0.6) + (processingScore * 0.4);

  const environmentRatio = environment?.errors?.length ? 0.45 : 0.85;
  const contradictionPenalty = contradictions.some((item) => item.severity === "Bloqueante") ? 0.08 : 0;

  const weighted = (
    (geoCoverageRatio * 0.3)
    + (criticalCoverageRatio * 0.25)
    + (eiaRatio * 0.2)
    + (satelliteRatio * 0.15)
    + (environmentRatio * 0.1)
  );
  const score = toPct(weighted) - Math.round(contradictionPenalty * 100);
  const finalScore = clamp(score, 0, 100);

  const blockers = [];
  if (criticalCoverageRatio < 1) {
    blockers.push("Fuentes georreferenciadas críticas incompletas");
  }
  if (coverage?.crossStatus === "No") {
    blockers.push("Sin cruce georreferenciado oficial ejecutado");
  }
  if (eia?.error) {
    blockers.push("No se pudo extraer el EIA de forma confiable");
  }
  if (satellite?.processingSignals?.error) {
    blockers.push("Procesamiento satelital NDVI/NDWI no disponible");
  }

  return {
    score: finalScore,
    level: bandFromScore(finalScore),
    conclusive: Boolean(coverage?.isSufficient),
    blockers,
    components: {
      georeferencedCoverage: toPct(geoCoverageRatio),
      criticalCoverage: toPct(criticalCoverageRatio),
      documentExtraction: toPct(eiaRatio),
      satellite: toPct(satelliteRatio),
      environment: toPct(environmentRatio),
    },
  };
};

module.exports = {
  computeEvidenceQuality,
};
