import { db } from "../db";
import { decrypt, encrypt } from "../crypto";
import { IntegrationError, request } from "./http";

export type Provider = "GOOGLE" | "JIRA";

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const ATLASSIAN_TOKEN_URL = "https://auth.atlassian.com/oauth/token";

export interface TokenSet { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }

export async function saveConnection(userId: string, provider: Provider, t: TokenSet, extra: { cloudId?: string; siteUrl?: string; externalId?: string } = {}) {
  const existing = await db.connection.findUnique({ where: { userId_provider: { userId, provider } } });
  const data = {
    accessToken: encrypt(t.access_token),
    // Google only returns a refresh token on first consent: keep the old one when absent.
    refreshToken: t.refresh_token ? encrypt(t.refresh_token) : existing?.refreshToken ?? null,
    expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null,
    scope: t.scope ?? existing?.scope ?? null,
    ...extra,
  };
  return db.connection.upsert({ where: { userId_provider: { userId, provider } }, update: data, create: { userId, provider, ...data } });
}

export const getConnection = (userId: string, provider: Provider) => db.connection.findUnique({ where: { userId_provider: { userId, provider } } });
export const dropConnection = (userId: string, provider: Provider) => db.connection.deleteMany({ where: { userId, provider } });

const inflight = new Map<string, Promise<string>>();

/** A valid access token for the connection, refreshing (and persisting the new tokens) when it is about to expire. */
export function accessTokenFor(conn: NonNullable<Awaited<ReturnType<typeof getConnection>>>): Promise<string> {
  if (!conn.expiresAt || conn.expiresAt.getTime() - Date.now() > 60_000) return Promise.resolve(decrypt(conn.accessToken));
  const key = conn.id;
  const running = inflight.get(key);
  if (running) return running;
  const p = refresh(conn).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function refresh(conn: NonNullable<Awaited<ReturnType<typeof getConnection>>>): Promise<string> {
  const service = conn.provider === "JIRA" ? "Jira" : "Google";
  if (!conn.refreshToken) throw new IntegrationError(service, "session expired — reconnect your account in Integrations");
  try {
    const rt = decrypt(conn.refreshToken);
    const t = conn.provider === "JIRA"
      ? await request<TokenSet>(service, ATLASSIAN_TOKEN_URL, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grant_type: "refresh_token", client_id: process.env.ATLASSIAN_CLIENT_ID, client_secret: process.env.ATLASSIAN_CLIENT_SECRET, refresh_token: rt }),
        })
      : await request<TokenSet>(service, GOOGLE_TOKEN_URL, {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: rt, grant_type: "refresh_token" }),
        });
    await saveConnection(conn.userId, conn.provider as Provider, t); // Atlassian rotates refresh tokens
    return t.access_token;
  } catch (e) {
    if (e instanceof IntegrationError && (e.status === 400 || e.status === 401 || e.status === 403)) {
      await dropConnection(conn.userId, conn.provider as Provider); // revoked or rotated away: user must reconnect
      throw new IntegrationError(service, "connection was revoked or expired — reconnect your account in Integrations", e.status);
    }
    throw e;
  }
}

/** A user who has connected the provider, preferring leads/admins: used for scheduled (cron) syncs. */
export async function serviceUserId(provider: Provider): Promise<string | undefined> {
  const c = await db.connection.findFirst({
    where: { provider, refreshToken: { not: null }, user: { active: true, access: { in: ["ADMIN", "LEAD"] } } },
    orderBy: [{ user: { access: "desc" } }, { updatedAt: "desc" }],
  });
  return c?.userId;
}
