import { db } from "./db";
import { decrypt, encrypt } from "./crypto";

/**
 * AI access for every AI task (meeting notes, developer insights, estimate review, pull request review).
 * Three providers are supported. Each person saves their OWN key (encrypted) for any of them and picks which one their AI buttons use,
 * so usage is billed to their account. When someone has no key, a server-wide key (ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY) is used if the admin set one.
 */
import { PROVIDERS, isProvider, providerLabel, type AiProvider } from "./ai-providers";
export { PROVIDERS, isProvider, providerLabel, type AiProvider };

export interface AiKey { key: string; provider: AiProvider; model: string; source: "user" | "server" }

const BASE: Record<AiProvider, () => string> = {
  anthropic: () => (process.env.ANTHROPIC_API_URL || "https://api.anthropic.com").replace(/\/$/, ""),
  openai: () => (process.env.OPENAI_API_URL || "https://api.openai.com").replace(/\/$/, ""),
  gemini: () => (process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, ""),
};
const ENV_MODEL: Record<AiProvider, string | undefined> = { anthropic: process.env.ANTHROPIC_MODEL, openai: process.env.OPENAI_MODEL, gemini: process.env.GEMINI_MODEL };
export const defaultModel = (p: AiProvider) => process.env[`${p.toUpperCase()}_MODEL`] || ENV_MODEL[p] || PROVIDERS.find((x) => x.id === p)!.defaultModel;
const ENV_KEY: Record<AiProvider, string> = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY" };

export class AiUnavailable extends Error {
  constructor() { super("Add an AI key (Claude, Gemini or OpenAI) in Settings to use AI features."); }
}

const connName = (p: AiProvider) => `AI_${p.toUpperCase()}`; // stored in the Connection table: one row per provider per person

/** The key an AI call should use for this person: their preferred provider, else any provider they saved, else a server-wide key. */
export async function aiKeyFor(userId?: string | null): Promise<AiKey | null> {
  if (userId) {
    const [rows, me] = await Promise.all([
      db.connection.findMany({ where: { userId, provider: { in: PROVIDERS.map((p) => connName(p.id)) } } }),
      db.developer.findUnique({ where: { id: userId }, select: { aiProvider: true } }),
    ]);
    const order = [me?.aiProvider, ...PROVIDERS.map((p) => p.id)].filter(isProvider);
    for (const p of order) {
      const row = rows.find((r) => r.provider === connName(p));
      if (!row) continue;
      try { return { key: decrypt(row.accessToken), provider: p, model: row.scope || defaultModel(p), source: "user" }; } catch { /* unreadable: try the next */ }
    }
  }
  for (const p of PROVIDERS) {
    const key = process.env[ENV_KEY[p.id]];
    if (key) return { key, provider: p.id, model: defaultModel(p.id), source: "server" };
  }
  return null;
}

export async function listUserProviders(userId: string) {
  const [rows, me] = await Promise.all([
    db.connection.findMany({ where: { userId, provider: { in: PROVIDERS.map((p) => connName(p.id)) } }, select: { provider: true, scope: true } }),
    db.developer.findUnique({ where: { id: userId }, select: { aiProvider: true } }),
  ]);
  const saved = PROVIDERS.filter((p) => rows.some((r) => r.provider === connName(p.id))).map((p) => ({ provider: p.id, model: rows.find((r) => r.provider === connName(p.id))?.scope || "" }));
  const preferred = saved.find((s) => s.provider === me?.aiProvider)?.provider ?? saved[0]?.provider ?? null;
  return { saved, preferred, serverProviders: PROVIDERS.filter((p) => !!process.env[ENV_KEY[p.id]]).map((p) => p.id) };
}

export async function saveUserKey(userId: string, provider: AiProvider, key: string, model?: string) {
  const data = { accessToken: encrypt(key), refreshToken: null, expiresAt: null, scope: model?.trim() || null };
  await db.connection.upsert({ where: { userId_provider: { userId, provider: connName(provider) } }, update: data, create: { userId, provider: connName(provider), ...data } });
  const me = await db.developer.findUnique({ where: { id: userId }, select: { aiProvider: true } });
  if (!me?.aiProvider) await db.developer.update({ where: { id: userId }, data: { aiProvider: provider } });
}
export async function removeUserKey(userId: string, provider: AiProvider) {
  await db.connection.deleteMany({ where: { userId, provider: connName(provider) } });
  const me = await db.developer.findUnique({ where: { id: userId }, select: { aiProvider: true } });
  if (me?.aiProvider === provider) await db.developer.update({ where: { id: userId }, data: { aiProvider: null } });
}
export const setPreferredProvider = (userId: string, provider: AiProvider) => db.developer.update({ where: { id: userId }, data: { aiProvider: provider } });

/** Checks a key without spending tokens (lists models). */
export async function validateKey(provider: AiProvider, key: string): Promise<void> {
  const url = provider === "anthropic" ? `${BASE.anthropic()}/v1/models?limit=1` : provider === "openai" ? `${BASE.openai()}/v1/models` : `${BASE.gemini()}/v1beta/models?pageSize=1`;
  const headers: Record<string, string> = provider === "anthropic" ? { "x-api-key": key, "anthropic-version": "2023-06-01" } : provider === "openai" ? { Authorization: `Bearer ${key}` } : { "x-goog-api-key": key };
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (res.status === 401 || res.status === 403 || (provider === "gemini" && res.status === 400)) throw new Error(`${providerLabel(provider)} rejected this key. Check it and try again.`);
  if (!res.ok) throw new Error(`Could not check the key (${providerLabel(provider)} returned ${res.status}).`);
}

/** Gemini and OpenAI want an explicit `type` on enum fields; our schemas leave it implicit. */
export function normalizeSchema(node: any): any {
  if (Array.isArray(node)) return node.map(normalizeSchema);
  if (!node || typeof node !== "object") return node;
  const out: any = {};
  for (const [k, v] of Object.entries(node)) out[k] = k === "properties" && v && typeof v === "object" ? Object.fromEntries(Object.entries(v as object).map(([pk, pv]) => [pk, normalizeSchema(pv)])) : normalizeSchema(v);
  if (out.enum && !out.type) out.type = "string";
  return out;
}

export interface AskParams { system: string; user: string; tool: string; description: string; schema: Record<string, unknown>; maxTokens?: number }

const fail = (a: AiKey, status: number, body: string): never => {
  if (status === 401 || status === 403) throw new Error(a.source === "user" ? `Your ${providerLabel(a.provider)} key was rejected. Update it in Settings.` : `The server's ${providerLabel(a.provider)} key was rejected.`);
  if (status === 429) throw new Error(`${providerLabel(a.provider)} is rate limited or out of credit on this account. Try again shortly.`);
  throw new Error(`${providerLabel(a.provider)} API ${status}: ${body.slice(0, 160)}`);
};

/** One AI call that must answer through a single structured tool; works the same on Claude, OpenAI and Gemini. Returns the tool input. */
export async function askAI(a: AiKey, p: AskParams): Promise<{ input: unknown; model: string }> {
  const schema = normalizeSchema(p.schema);
  const max = p.maxTokens ?? 2000;
  const init = (headers: Record<string, string>, body: unknown): RequestInit => ({ method: "POST", signal: AbortSignal.timeout(120_000), cache: "no-store", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

  if (a.provider === "anthropic") {
    const res = await fetch(`${BASE.anthropic()}/v1/messages`, init({ "x-api-key": a.key, "anthropic-version": "2023-06-01" }, {
      model: a.model, max_tokens: max, system: p.system, tools: [{ name: p.tool, description: p.description, input_schema: schema }], tool_choice: { type: "tool", name: p.tool }, messages: [{ role: "user", content: p.user }],
    }));
    if (!res.ok) return fail(a, res.status, await res.text());
    const data: any = await res.json();
    const block = (data.content ?? []).find((b: any) => b.type === "tool_use" && b.name === p.tool);
    if (!block) throw new Error("The AI did not return a usable answer.");
    return { input: block.input, model: data.model ?? a.model };
  }

  if (a.provider === "openai") {
    const res = await fetch(`${BASE.openai()}/v1/chat/completions`, init({ Authorization: `Bearer ${a.key}` }, {
      model: a.model, max_completion_tokens: max, messages: [{ role: "system", content: p.system }, { role: "user", content: p.user }],
      tools: [{ type: "function", function: { name: p.tool, description: p.description, parameters: schema } }], tool_choice: { type: "function", function: { name: p.tool } },
    }));
    if (!res.ok) return fail(a, res.status, await res.text());
    const data: any = await res.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("The AI did not return a usable answer.");
    try { return { input: JSON.parse(args), model: data.model ?? a.model }; } catch { throw new Error("The AI returned an answer that could not be read."); }
  }

  const res = await fetch(`${BASE.gemini()}/v1beta/models/${encodeURIComponent(a.model)}:generateContent`, init({ "x-goog-api-key": a.key }, {
    systemInstruction: { parts: [{ text: p.system }] }, contents: [{ role: "user", parts: [{ text: p.user }] }],
    tools: [{ functionDeclarations: [{ name: p.tool, description: p.description, parameters: schema }] }],
    toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [p.tool] } }, generationConfig: { maxOutputTokens: max },
  }));
  if (!res.ok) return fail(a, res.status, await res.text());
  const data: any = await res.json();
  const call = (data.candidates?.[0]?.content?.parts ?? []).find((x: any) => x.functionCall)?.functionCall;
  if (!call?.args) throw new Error("The AI did not return a usable answer.");
  return { input: call.args, model: a.model };
}

/** @deprecated kept so older imports keep working; use askAI. */
export const askClaude = askAI;

export const saveInsight = (kind: string, subjectId: string, content: unknown, model: string, createdById?: string | null) =>
  db.aiInsight.create({ data: { kind, subjectId, content: content as any, model, createdById: createdById ?? null } });
export const latestInsight = (kind: string, subjectId: string) =>
  db.aiInsight.findFirst({ where: { kind, subjectId }, orderBy: { createdAt: "desc" } });
