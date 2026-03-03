const { extractEiaInsights } = require("../../auditEngine");

const getEiaInsights = async (documentText) => {
  if (!documentText) {
    return null;
  }
  try {
    return await extractEiaInsights(documentText);
  } catch (error) {
    return { error: error.message || "EIA extraction failed." };
  }
};

module.exports = {
  getEiaInsights,
};
