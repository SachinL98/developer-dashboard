// Leave, WFH and public holidays come from the HR app (Seamless Source HR) when HR_API_URL and HR_API_TOKEN are set.
// Pure mapping lives here so it can be tested without a network or database.
import type { Holiday, LeaveLite } from "./capacity";

export interface HrFeed {
  members: { id: string; email: string; name: string }[];
  days: { email: string; date: string; part: "FULL" | "AM" | "PM"; type: "LEAVE" | "WFH" | "OUT_OF_OFFICE" }[];
  holidays: { date: string; name: string }[];
}

export const hrConfigured = () => !!process.env.HR_API_URL && !!process.env.HR_API_TOKEN;

/** Away days become one-day leave entries keyed by the developer's id. WFH keeps people available, so it is not leave. */
export function feedToLeave(feed: HrFeed, idByEmail: Map<string, string>): LeaveLite[] {
  const out: LeaveLite[] = [];
  for (const d of feed.days) {
    if (d.type === "WFH") continue;
    const developerId = idByEmail.get(d.email.toLowerCase());
    if (!developerId) continue;
    out.push({ developerId, start: d.date, end: d.date, portion: d.part === "FULL" ? "FULL" : "HALF" });
  }
  return out;
}

export const feedToHolidays = (feed: HrFeed): Holiday[] => feed.holidays.map((h) => ({ date: h.date, name: h.name })).sort((a, b) => a.date.localeCompare(b.date));

/** Dates a person works from home, for display. */
export const wfhDays = (feed: HrFeed, email: string): string[] => feed.days.filter((d) => d.type === "WFH" && d.email === email.toLowerCase()).map((d) => d.date);

const cache = new Map<string, { at: number; feed: HrFeed }>();
const TTL = 60_000;

export async function fetchHrFeed(from: string, to: string): Promise<HrFeed> {
  const key = `${from}|${to}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.feed;
  const url = `${process.env.HR_API_URL!.replace(/\/$/, "")}/integrations/availability?from=${from}&to=${to}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.HR_API_TOKEN}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HR app answered ${res.status}`);
  const feed = (await res.json()) as HrFeed;
  cache.set(key, { at: Date.now(), feed });
  return feed;
}
