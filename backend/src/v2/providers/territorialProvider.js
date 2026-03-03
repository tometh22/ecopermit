const { fetchTerritorialSignals } = require("../../territorialService");

const getTerritorialSignals = async ({ coordinates, boundary }) => {
  const signals = await fetchTerritorialSignals({ coordinates, boundary });
  return signals || { summary: null, evidence: null, alerts: [], regulatoryRefs: [], error: "Sin datos territoriales." };
};

module.exports = {
  getTerritorialSignals,
};
