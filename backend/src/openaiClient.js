const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.2";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 12000);

const isOpenAIConfigured = () => Boolean(OPENAI_API_KEY);

const createResponse = async ({ input, instructions, reasoningEffort }) => {
  if (!OPENAI_API_KEY) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  const payload = {
    model: OPENAI_MODEL,
    input,
  };

  if (instructions) {
    payload.instructions = instructions;
  }
  if (reasoningEffort) {
    payload.reasoning = { effort: reasoningEffort };
  }

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI error ${response.status}: ${errorText}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const extractOutputText = (response) => {
  if (!response || !Array.isArray(response.output)) {
    return "";
  }

  const chunks = [];
  for (const item of response.output) {
    if (item.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }

    for (const part of item.content) {
      if (part.type === "output_text" && part.text) {
        chunks.push(part.text);
      }
    }
  }

  return chunks.join("\n");
};

module.exports = {
  createResponse,
  extractOutputText,
  isOpenAIConfigured,
  OPENAI_MODEL,
};
