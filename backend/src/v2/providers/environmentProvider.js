const { fetchEnvironmentalContext } = require("../../contextService");

const getEnvironmentSignals = async (coordinates) => {
  const context = await fetchEnvironmentalContext(coordinates);
  return context || { airQuality: null, weather: null, errors: ["GOOGLE_ENV_API_KEY no configurada."] };
};

module.exports = {
  getEnvironmentSignals,
};
