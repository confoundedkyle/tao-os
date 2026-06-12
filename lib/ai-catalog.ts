// Pure module: AI provider ids + display labels. Deliberately free of
// server-only/db/SDK imports so the public catalog route can use it.

export const SUPPORTED_PROVIDERS = [
  "calyflow",
  "anthropic",
  "openai",
  "google",
  "mistral",
  "xai",
  "deepseek",
  "groq",
  "cohere",
] as const;

export function providerLabel(provider: string): string {
  switch (provider) {
    case "calyflow":
      return "Calyflow default";
    case "anthropic":
      return "Anthropic";
    case "openai":
      return "OpenAI";
    case "google":
      return "Google";
    case "mistral":
      return "Mistral";
    case "xai":
      return "xAI (Grok)";
    case "deepseek":
      return "DeepSeek";
    case "groq":
      return "Groq";
    case "cohere":
      return "Cohere";
    default:
      return provider;
  }
}
