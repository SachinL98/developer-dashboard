import { googleFetch } from "./google";

const BASE = "https://meet.googleapis.com/v2";

export const meetCodeFromUrl = (url: string | null | undefined) => url?.match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i)?.[1]?.toLowerCase() ?? null;

export interface Entry { participant?: string; text?: string; startTime?: string }

/** "Name: text" lines in speaking order; consecutive turns by one speaker are merged. Pure, so it is unit tested. */
export function formatTranscript(entries: Entry[], names: Record<string, string>): string {
  const lines: { who: string; text: string }[] = [];
  for (const e of [...entries].sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""))) {
    const text = e.text?.trim();
    if (!text) continue;
    const who = (e.participant && names[e.participant]) || "Speaker";
    const last = lines[lines.length - 1];
    if (last && last.who === who) last.text += " " + text; else lines.push({ who, text });
  }
  return lines.map((l) => `${l.who}: ${l.text}`).join("\n");
}

async function paged<T>(url: string, key: string): Promise<T[]> {
  const out: T[] = [];
  let token: string | undefined;
  do {
    const sep = url.includes("?") ? "&" : "?";
    const page = await googleFetch<any>(`${url}${token ? `${sep}pageToken=${encodeURIComponent(token)}` : ""}`);
    out.push(...(page[key] ?? []));
    token = page.nextPageToken;
  } while (token);
  return out;
}

export interface TranscriptResult { text: string; record: string }

/**
 * Real Meet transcript for the meeting that used `code` around [start, end].
 * Needs a transcript to have been recorded (Meet "Transcript" turned on) and the connected account to be an organiser/host.
 * Returns null when there is none yet (Meet makes it available a few minutes after the call ends).
 */
export async function fetchTranscript(code: string, start: Date, end: Date): Promise<TranscriptResult | null> {
  const filter = encodeURIComponent(`space.meeting_code = "${code}"`);
  const records = await paged<{ name: string; startTime: string; endTime?: string }>(`${BASE}/conferenceRecords?filter=${filter}&pageSize=50`, "conferenceRecords");
  // The room code is reused every day for recurring events: pick the conference that overlaps this occurrence.
  const lo = start.getTime() - 30 * 60_000, hi = end.getTime() + 30 * 60_000;
  const rec = records
    .filter((r) => { const t = new Date(r.startTime).getTime(); return t >= lo && t <= hi; })
    .sort((a, b) => Math.abs(new Date(a.startTime).getTime() - start.getTime()) - Math.abs(new Date(b.startTime).getTime() - start.getTime()))[0];
  if (!rec) return null;

  const transcripts = await paged<{ name: string; state?: string }>(`${BASE}/${rec.name}/transcripts`, "transcripts");
  const ready = transcripts.filter((t) => !t.state || t.state === "FILE_GENERATED" || t.state === "ENDED");
  if (!ready.length) return null;

  const entries: Entry[] = [];
  for (const t of ready) entries.push(...(await paged<Entry>(`${BASE}/${t.name}/entries?pageSize=100`, "transcriptEntries")));
  if (!entries.length) return null;

  const names: Record<string, string> = {};
  for (const id of new Set(entries.map((e) => e.participant).filter(Boolean) as string[])) {
    try {
      const p = await googleFetch<any>(`${BASE}/${id}`);
      names[id] = p.signedinUser?.displayName ?? p.anonymousUser?.displayName ?? p.phoneUser?.displayName ?? "Guest";
    } catch { names[id] = "Guest"; }
  }
  return { text: formatTranscript(entries, names), record: rec.name };
}
