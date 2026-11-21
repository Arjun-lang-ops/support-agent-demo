// Pick a provider with LLM_PROVIDER: google (free tier), openai, or anthropic.
// Install only the package you use.
export async function getLLM() {
  const provider = process.env.LLM_PROVIDER || "google";

  if (provider === "anthropic") {
    const { ChatAnthropic } = await import("@langchain/anthropic");
    return new ChatAnthropic({
      model: process.env.LLM_MODEL || "claude-sonnet-5-5",
      temperature: 0,
    });
  }

  if (provider === "openai") {
    const { ChatOpenAI } = await import("@langchain/openai");
    return new ChatOpenAI({
      model: process.env.LLM_MODEL || "gpt-4o-mini",
      temperature: 0,
    });
  }

  // Google Gemini via an AI Studio key
  const { ChatGoogleGenerativeAI } = await import("@langchain/google-genai");
  return new ChatGoogleGenerativeAI({
    model: process.env.LLM_MODEL || "gemini-2.5-flash",
    temperature: 0,
    apiKey: process.env.GOOGLE_API_KEY,
  });
}