const DEFAULT_MODEL = "gpt-4o-mini";

export async function requestStructuredAi({ system, user, schema }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("AI assistance is not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(response.status === 429 ? "AI assistance is temporarily busy" : "AI provider request failed");
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("AI returned an invalid response");
    const parsed = JSON.parse(content);
    return schema.parse(parsed);
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("AI assistance timed out");
    if (error?.name === "ZodError" || error instanceof SyntaxError) throw new Error("AI returned an invalid response");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
