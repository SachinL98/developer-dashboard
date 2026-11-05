import { db } from "./db";
import { decrypt, encrypt } from "./crypto";

/**
 * Claude access for the AI features. Each person uses their OWN Anthropic API key (saved encrypted in Settings), so usage is billed
 * to their account. If they haven't added one, the server-wide ANTHROPIC_API_KEY is used when the admin has set it.
 */
export interface AiKey { key: string; source: "user" | "server" }

const API = () => (process.env.ANTHROPIC_API_URL || "https://api.anthropic.com").replace(/\/$/, "");
export const aiModel = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

export class AiUnavailable extends Error {
  constructor() { super("Add your Claude API key in Settings to use AI features."); }
}

export async function aiKeyFor(userId?: string | null): Promise<AiKey | null> {
  if (userId) {
    const c = await db.connection.findUnique({ where: { userId_provider: { userId, provider: "CLAUDE" } } });
    if (c) { try { return { key: decrypt(c.accessToken), source: "user" }; } catch { /* unreadable: fall through */ } }
  }
  return process.env.ANTHROPIC_API_KEY ? { key: process.env.ANTHROPIC_API_KEY, source: "server" } : null;
}

export async function saveUserKey(userId: string, key: string) {
  const data = { accessToken: encrypt(key), refreshToken: null, expiresAt: null, scope: null };
  await db.connection.upsert({ where: { userId_provider: { userId, provider: "CLAUDE" } }, update: data, create: { userId, provider: "CLAUDE", ...data } });
}
export const removeUserKey = (userId: string) => db.connection.deleteMany({ where: { userId, provider: "CLAUDE" } });

/** Checks a key without spending tokens (lists models). */
export async function validateKey(key: string): Promise<void> {
  const res = await fetch(`${API()}/v1/models?limit=1`, { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (res.status === 401 || res.status === 403) throw new Error("Anthropic rejected this key. Check it and try again.");
  if (!res.ok) throw new Error(`Could not check the key (Anthropic returned ${res.status}).`);
}

/** One Claude call that must answer through a single tool; returns the tool's validated-by-caller input. */
export async function askClaude(a: AiKey, p: { system: string; user: string; tool: string; description: string; schema: Record<string, unknown>; maxTokens?: number }): Promise<{ input: unknown; model: string }> {
  const res = await fetch(`${API()}/v1/messages`, {
    method: "POST", signal: AbortSignal.timeout(120_000), cache: "no-store",
    headers: { "x-api-key": a.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: aiModel(), max_tokens: p.maxTokens ?? 2000, system: p.system,
      tools: [{ name: p.tool, description: p.description, input_schema: p.schema }], tool_choice: { type: "tool", name: p.tool },
      messages: [{ role: "user", content: p.user }],
    }),
  });
  if (res.status === 401) throw new Error(a.source === "user" ? "Your Claude API key was rejected. Update it in Settings." : "The server's Claude API key was rejected.");
  if (res.status === 429) throw new Error("Claude is rate limited or out of credit on this account. Try again shortly.");
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data: any = await res.json();
  const block = (data.content ?? []).find((b: any) => b.type === "tool_use" && b.name === p.tool);
  if (!block) throw new Error("Claude did not return a usable answer.");
  return { input: block.input, model: data.model ?? aiModel() };
}

export const saveInsight = (kind: string, subjectId: string, content: unknown, model: string, createdById?: string | null) =>
  db.aiInsight.create({ data: { kind, subjectId, content: content as any, model, createdById: createdById ?? null } });
export const latestInsight = (kind: string, subjectId: string) =>
  db.aiInsight.findFirst({ where: { kind, subjectId }, orderBy: { createdAt: "desc" } });
