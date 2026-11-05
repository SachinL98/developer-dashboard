// Matching spoken names to people. Pure (no database): aliases first, then exact, fuzzy and email matches.
import type { PersonLite } from "./transcript";

export const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const GENERIC = new Set(["", "speaker", "guest", "unknown", "participant", "user", "host"]);
export const isGenericSpeaker = (name: string) => { const n = norm(name); return GENERIC.has(n) || /^speaker [a-z0-9]{1,2}$/.test(n) || /^(guest|user|participant) \d+$/.test(n) || /^spk[ _]?\d+$/.test(n); };

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
const sim = (a: string, b: string) => (a || b ? 1 - levenshtein(a, b) / Math.max(a.length, b.length) : 0);

/** 0..1: how likely the spoken name is this person. Handles "Nimal R.", "N. Rajapaksha", typos, email-style names. */
export function score(spoken: string, p: PersonLite): number {
  const s = norm(spoken);
  if (!s) return 0;
  const full = norm(p.name);
  if (s === full) return 1;
  const mail = norm(p.email.split("@")[0]);
  if (s === mail) return 0.95;
  const st = s.split(" "), pt = full.split(" ");
  const sFirst = st[0], pFirst = pt[0], sLast = st.length > 1 ? st[st.length - 1] : "", pLast = pt.length > 1 ? pt[pt.length - 1] : "";
  let best = sim(s, full);
  if (!sLast && sFirst === pFirst) best = Math.max(best, 0.8); // first name only
  if (sLast) {
    const firstOk = sFirst === pFirst || (sFirst.length === 1 && pFirst.startsWith(sFirst)) || sim(sFirst, pFirst) >= 0.8;
    const lastOk = sLast === pLast || (sLast.length === 1 && pLast.startsWith(sLast)) || sim(sLast, pLast) >= 0.8;
    if (firstOk && lastOk) best = Math.max(best, 0.9);
    else if (firstOk && sFirst === pFirst) best = Math.max(best, 0.55);
  }
  if (sim(sFirst, pFirst) >= 0.85 && !sLast) best = Math.max(best, 0.7);
  return Math.min(1, best);
}

export interface Candidate { person: PersonLite; score: number }

/** Best candidates for a spoken name, highest first. */
export function suggestPeople(spoken: string, people: PersonLite[], limit = 3): Candidate[] {
  return people.map((person) => ({ person, score: score(spoken, person) })).filter((c) => c.score >= 0.5).sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Who a spoken name belongs to, or null when unsure. A saved alias always wins; otherwise the best match must be clearly
 * ahead of the runner-up, so "Nuwan" is not guessed when two people share that first name.
 */
export function matchSpeaker(spoken: string, people: PersonLite[], aliases: Record<string, string> = {}): PersonLite | null {
  if (isGenericSpeaker(spoken)) return null;
  const aliasId = aliases[norm(spoken)];
  if (aliasId) return people.find((p) => p.id === aliasId) ?? null;
  const [a, b] = suggestPeople(spoken, people, 2);
  if (!a || a.score < 0.7) return null;
  return !b || a.score - b.score >= 0.15 ? a.person : null;
}
