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
