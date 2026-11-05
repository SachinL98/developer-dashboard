// Provider metadata only: no server imports, so client components can use it.
export type AiProvider = "anthropic" | "openai" | "gemini";

export const PROVIDERS: { id: AiProvider; label: string; keyHint: string; keyUrl: string; defaultModel: string; keyPattern: RegExp }[] = [
  { id: "anthropic", label: "Claude (Anthropic)", keyHint: "sk-ant-…", keyUrl: "console.anthropic.com", defaultModel: "claude-sonnet-5-5", keyPattern: /^sk-ant-/ },
  { id: "openai", label: "OpenAI (ChatGPT)", keyHint: "sk-…", keyUrl: "platform.openai.com/api-keys", defaultModel: "gpt-4o", keyPattern: /^sk-/ },
  { id: "gemini", label: "Google Gemini", keyHint: "AIza…", keyUrl: "aistudio.google.com/apikey", defaultModel: "gemini-2.0-flash", keyPattern: /^AIza/ },
];
export const providerLabel = (p: AiProvider) => PROVIDERS.find((x) => x.id === p)?.label ?? p;
export const isProvider = (v: unknown): v is AiProvider => v === "anthropic" || v === "openai" || v === "gemini";

