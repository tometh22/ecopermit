const toBand = (value) => {
  if (value >= 0.75) {
    return "Alta";
  }
  if (value >= 0.45) {
    return "Media";
  }
  return "Baja";
};

const confidenceFromSource = ({ hasData, hasError, sourceType }) => {
  if (hasError) {
    return 0.25;
  }
  if (!hasData) {
    return 0.15;
  }
  if (sourceType === "official_api") {
    return 0.85;
  }
  if (sourceType === "open_data") {
    return 0.7;
  }
  if (sourceType === "llm_extraction") {
    return 0.55;
  }
  return 0.5;
};

const buildConfidencePack = ({
  environment,
  territorialSignals,
  planetSignals,
  planetProcessingSignals,
  eia,
  regulatorySignals,
}) => {
  const environmentScore = confidenceFromSource({
    hasData: Boolean(environment?.airQuality || environment?.weather),
    hasError: Boolean(environment?.errors?.length),
    sourceType: "official_api",
  });

  const territorialScore = confidenceFromSource({
    hasData: Boolean(territorialSignals?.summary),
    hasError: Boolean(territorialSignals?.error),
    sourceType: "open_data",
  });

  const planetScore = confidenceFromSource({
    hasData: Boolean(planetSignals && !planetSignals.error),
    hasError: Boolean(planetSignals?.error),
    sourceType: "official_api",
  });

  const processingScore = confidenceFromSource({
    hasData: Boolean(planetProcessingSignals && !planetProcessingSignals.error),
    hasError: Boolean(planetProcessingSignals?.error),
    sourceType: "official_api",
  });

  const eiaScore = confidenceFromSource({
    hasData: Boolean(eia && !eia.error),
    hasError: Boolean(eia?.error),
    sourceType: "llm_extraction",
  });

  const regulatoryScore = confidenceFromSource({
    hasData: Boolean(regulatorySignals?.coverage?.healthySources),
    hasError: Boolean(!regulatorySignals?.coverage?.isSufficient),
    sourceType: "official_api",
  });

  const overallScore = (
    environmentScore
    + territorialScore
    + planetScore
    + processingScore
    + eiaScore
    + regulatoryScore
  ) / 6;

  return {
    environment: { score: environmentScore, level: toBand(environmentScore) },
    territorial: { score: territorialScore, level: toBand(territorialScore) },
    planet: { score: planetScore, level: toBand(planetScore) },
    processing: { score: processingScore, level: toBand(processingScore) },
    eia: { score: eiaScore, level: toBand(eiaScore) },
    regulatory: { score: regulatoryScore, level: toBand(regulatoryScore) },
    overall: {
      score: overallScore,
      level: toBand(overallScore),
    },
  };
};

module.exports = {
  buildConfidencePack,
};
