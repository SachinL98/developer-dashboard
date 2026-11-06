import { db } from "./db";

/** Small in-memory sliding-window limiter, per server process. Enough to stop an accidental loop or a user burning the shared Claude key. */
const hits = new Map<string, number[]>();

export class RateLimited extends Error {
  constructor(public retryAfterSec: number) { super(`Too many requests. Try again in ${Math.max(1, Math.ceil(retryAfterSec / 60))} min.`); }
}

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): void {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) { hits.set(key, recent); throw new RateLimited((windowMs - (now - recent[0])) / 1000); }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
}
export const resetRateLimits = () => hits.clear();

/**
 * Rate limit shared by every server instance (a fixed window kept in the database), so limits hold on serverless hosting.
 * If the database cannot be reached it falls back to the in-memory limiter above, so a database blip never blocks sign-in.
 */
export async function rateLimitShared(key: string, limit: number, windowMs: number): Promise<void> {
  const now = new Date(), cutoff = new Date(now.getTime() - windowMs);
  let row: { count: number; windowStart: Date } | undefined;
  try {
    const r = await db.$queryRaw<{ count: number; windowStart: Date }[]>`
      INSERT INTO "RateLimit" ("key", "windowStart", "count") VALUES (${key}, ${now}, 1)
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."windowStart" < ${cutoff} THEN 1 ELSE "RateLimit"."count" + 1 END,
        "windowStart" = CASE WHEN "RateLimit"."windowStart" < ${cutoff} THEN ${now} ELSE "RateLimit"."windowStart" END
      RETURNING "count", "windowStart"`;
    row = r[0];
  } catch { return rateLimit(key, limit, windowMs); }
  if (row && row.count > limit) throw new RateLimited((row.windowStart.getTime() + windowMs - now.getTime()) / 1000);
}
