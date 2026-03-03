const { fetchPlanetSignals } = require("../../planetService");
const { fetchPlanetProcessingSignals } = require("../../planetProcessingService");

const getSatelliteSignals = async ({ coordinates, boundary }) => {
  const [planetSignals, processingSignals] = await Promise.all([
    fetchPlanetSignals({ coordinates, boundary }),
    fetchPlanetProcessingSignals({ coordinates, boundary }),
  ]);

  return {
    planetSignals: planetSignals || null,
    processingSignals: processingSignals || null,
  };
};

module.exports = {
  getSatelliteSignals,
};
