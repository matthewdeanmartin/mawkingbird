export const DEFAULT_MODELS = [
  "openai/gpt-4o",
  "anthropic/claude-sonnet-4",
  "google/gemini-2.5-pro",
];

export const DEFAULT_INSTRUCTIONS = [
  "Make the claim precise and verifiable. Remove guarantees the product cannot support, while keeping the useful information.",
  "Shorten the wording and use plain language. Keep essential caveats and the original meaning.",
  "Explain data flow, cost, availability, or compatibility boundaries where relevant. Say what the user can actually expect.",
];

export function validateRedraftSettings(input) {
  const models = input?.models;
  const instructions = input?.instructions;
  const count = Number(input?.alternativesPerPair);
  if (
    !Array.isArray(models) ||
    models.length !== 3 ||
    models.some(
      (model) =>
        typeof model !== "string" || !/^[\w./:-]{3,120}$/.test(model.trim()),
    ) ||
    new Set(models.map((model) => model.trim())).size !== 3
  )
    throw new Error("Enter three different OpenRouter model IDs.");
  if (
    !Array.isArray(instructions) ||
    instructions.length !== 3 ||
    instructions.some(
      (instruction) =>
        typeof instruction !== "string" ||
        !instruction.trim() ||
        instruction.length > 1000,
    ) ||
    new Set(instructions.map((instruction) => instruction.trim())).size !== 3
  )
    throw new Error(
      "Enter three different improvement instructions (up to 1,000 characters each).",
    );
  if (!Number.isInteger(count) || count < 1 || count > 5)
    throw new Error(
      "Choose 1 to 5 alternatives per model and instruction pair.",
    );
  return {
    models: models.map((model) => model.trim()),
    instructions: instructions.map((instruction) => instruction.trim()),
    alternativesPerPair: count,
  };
}

export function parseAlternatives(content, limit) {
  const text = Array.isArray(content)
    ? content
        .filter((part) => part?.type === "text")
        .map((part) => part.text)
        .join("")
    : content;
  if (typeof text !== "string" || !text.trim())
    throw new Error("The model returned no text.");
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* use plain text below */
      }
    }
  }
  const items = parsed?.alternatives;
  if (!Array.isArray(items)) {
    if (limit === 1) return [cleaned];
    throw new Error("The model did not return an alternatives array.");
  }
  const alternatives = items
    .map((item) => (typeof item === "string" ? item : item?.text))
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim())
    .slice(0, limit);
  if (!alternatives.length)
    throw new Error("The model returned no usable alternatives.");
  return [...new Set(alternatives)];
}

export async function requestAlternatives({
  apiKey,
  model,
  instruction,
  text,
  count,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Mawkingbird Museum",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You redraft English UI copy. Return only a JSON object with an alternatives array of strings. Each alternative must be a standalone replacement, not commentary. Preserve every {{placeholder}} exactly, preserve any HTML tags exactly, and do not invent product capabilities or privacy guarantees. Use one line per alternative.",
          },
          {
            role: "user",
            content: JSON.stringify({
              original: text,
              improvement: instruction,
              alternatives: count,
            }),
          },
        ],
        temperature: 0.8,
        max_tokens: Math.min(3000, 450 + count * 450),
      }),
      signal: AbortSignal.timeout(90000),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      `OpenRouter ${response.status}: ${body?.error?.message || response.statusText}`,
    );
  return parseAlternatives(body?.choices?.[0]?.message?.content, count);
}

export async function redraftAcrossPairs(
  record,
  settings,
  apiKey,
  fetchImpl = fetch,
) {
  const jobs = settings.models.flatMap((model, modelIndex) =>
    settings.instructions.map((instruction, instructionIndex) => ({
      model,
      modelIndex,
      instruction,
      instructionIndex,
    })),
  );
  const results = new Array(jobs.length);
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const index = next++;
      const job = jobs[index];
      try {
        results[index] = {
          ...job,
          alternatives: await requestAlternatives({
            apiKey,
            model: job.model,
            instruction: job.instruction,
            text: record.text,
            count: settings.alternativesPerPair,
            fetchImpl,
          }),
        };
      } catch (error) {
        results[index] = { ...job, error: error.message };
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return results;
}
