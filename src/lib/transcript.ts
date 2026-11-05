// Turning a transcript into who-said-what-when, and into talk-time statistics. Pure (no database), so it is unit tested.

export interface Segment { speaker: string; text: string; start?: number; end?: number } // seconds from the start of the call
export interface Parsed { segments: Segment[]; hasTimes: boolean; durationSec?: number }

export const WORDS_PER_SEC = 2.5; // ~150 words a minute, used when a transcript has no timestamps
const NOT_A_SPEAKER = /^(action(?: item)?s?|todo|decision|blocker|yesterday|today|note|summary|agenda|attendees|date|time|topic|next steps?)$/i;
const SPEAKER_LINE = /^([A-ZÀ-ɏ][\w.'’\- À-ɏ]{0,40}?)\s*:\s+(.*)$/;

const toSec = (h: string | undefined, m: string, s: string, frac?: string) => (h ? +h : 0) * 3600 + +m * 60 + +s + (frac ? +`0.${frac}` : 0);
const TS = String.raw`(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?`;
const CUE = new RegExp(String.raw`^\s*${TS}\s*-->\s*${TS}`);
const LEADING_TS = new RegExp(String.raw`^\s*[\[(]?${TS}[\])]?\s*[-–]?\s*(.*)$`);
const TRAILING_TS = new RegExp(String.raw`^([A-Z][^:()]{1,40}?)\s*[\[(]${TS}[\])]\s*:?\s*(.*)$`);

export const words = (s: string) => (s.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const cleanName = (s: string) => clean(s.replace(/[<>\[\]]/g, ""));

/** Accepts Google Meet text ("Name: text"), lines with timestamps ("[00:01:23] Name: text", "Name (1:23): text"), and WebVTT/SRT captions. */
export function parseTranscript(raw: string): Parsed {
  const lines = raw.replace(/^﻿/, "").split(/\r?\n/);
  const segs: Segment[] = [];
  let last = null as Segment | null;
  let cue: { start: number; end: number } | null = null;
  const push = (speaker: string, text: string, start?: number, end?: number) => {
    const t = clean(text);
    if (!t) return;
    // Same speaker continuing with no new time information: one turn.
    if (last && last.speaker === speaker && start == null && end == null) { last.text += " " + t; return; }
    last = { speaker, text: t, start, end }; segs.push(last);
  };

  for (const line0 of lines) {
    const line = line0.trim();
    if (!line || /^WEBVTT/i.test(line) || /^NOTE\b/.test(line) || /^\d+$/.test(line)) { if (!line) cue = null; continue; }
    const c = line.match(CUE);
    if (c) { cue = { start: toSec(c[1], c[2], c[3], c[4]), end: toSec(c[5], c[6], c[7], c[8]) }; last = null; continue; }
    let speaker = "Speaker", text = line;
    const vtt = line.match(/^<v\s+([^>]+)>(.*?)(?:<\/v>)?$/);
    if (vtt) { speaker = cleanName(vtt[1]); text = vtt[2]; }
    else {
      const tr = line.match(TRAILING_TS);
      if (tr) { push(cleanName(tr[1]), tr[6], toSec(tr[2], tr[3], tr[4], tr[5])); continue; }
      let start: number | undefined;
      const lead = line.match(LEADING_TS);
      if (lead && !cue) { start = toSec(lead[1], lead[2], lead[3], lead[4]); text = lead[5]; }
      const sp = text.match(SPEAKER_LINE);
      if (sp && !NOT_A_SPEAKER.test(sp[1].trim())) { speaker = cleanName(sp[1]); text = sp[2]; }
      else if (!cue && start == null && last) { last.text += " " + clean(text); continue; } // wrapped line of the previous turn
      else if (!cue && start == null) speaker = "Speaker";
      if (start != null) { push(speaker, text, start); continue; }
    }
    if (cue) { push(speaker, text, cue.start, cue.end); continue; }
    push(speaker, text);
  }

  const hasTimes = segs.some((s) => s.start != null);
  const ends = segs.map((s) => s.end ?? s.start).filter((x): x is number => x != null);
  return { segments: segs, hasTimes, durationSec: ends.length ? Math.round(Math.max(...ends)) : undefined };
}

export interface SpeakerStat { name: string; talkSec: number; words: number; turns: number; estimated: boolean }

/** Seconds spoken per person. Uses real start/end times when the transcript has them; otherwise estimates from word count. */
export function talkStats(segments: Segment[]): SpeakerStat[] {
  const by = new Map<string, SpeakerStat & { real: boolean }>();
  segments.forEach((s, i) => {
    const w = words(s.text);
    if (!w) return;
    const guess = w / WORDS_PER_SEC;
    let sec: number | null = null;
    if (s.start != null && s.end != null && s.end > s.start) sec = Math.min(s.end - s.start, guess * 3 + 5);
    else if (s.start != null) {
      const next = segments.slice(i + 1).find((x) => x.start != null)?.start;
      // The gap to the next turn includes pauses and other people's silence, so never count more than a generous multiple of the words.
      sec = next != null && next > s.start ? Math.min(next - s.start, guess * 1.5 + 2) : guess;
    }
    const row = by.get(s.speaker) ?? { name: s.speaker, talkSec: 0, words: 0, turns: 0, estimated: false, real: false };
    row.talkSec += sec ?? guess; row.words += w; row.turns++;
    if (sec != null) row.real = true;
    by.set(s.speaker, row);
  });
  return [...by.values()].map(({ real, ...r }) => ({ ...r, talkSec: Math.round(r.talkSec), estimated: !real })).sort((a, b) => b.talkSec - a.talkSec);
}

export interface PersonLite { id: string; name: string; email: string }

/** Match a spoken name to someone in the app: full name, then a unique first name, then the email name. */
export function matchPerson(name: string, people: PersonLite[]): PersonLite | null {
  const n = name.trim().toLowerCase();
  if (!n || n === "speaker" || n === "guest") return null;
  const exact = people.filter((p) => p.name.toLowerCase() === n);
  if (exact.length === 1) return exact[0];
  const first = n.split(" ")[0];
  const byFirst = people.filter((p) => p.name.toLowerCase().split(" ")[0] === first);
  if (byFirst.length === 1 && first.length >= 3) return byFirst[0];
  const byMail = people.filter((p) => p.email.split("@")[0].toLowerCase().replace(/[._-]/g, " ") === n.replace(/[._-]/g, " "));
  return byMail.length === 1 ? byMail[0] : null;
}

export interface Engagement {
  totalTalkSec: number; speakers: number; dominantShare: number; balance: number; // balance: 0 = one person talks, 1 = perfectly even
  rows: { name: string; talkSec: number; sharePct: number; words: number; turns: number; estimated: boolean }[];
  silent: string[]; // expected attendees who never spoke
}

/** Participation picture of one meeting. `expected` are the people who were meant to be there (names). */
export function engagementOf(stats: SpeakerStat[], expected: string[] = []): Engagement {
  const total = stats.reduce((a, s) => a + s.talkSec, 0);
  const rows = stats.map((s) => ({ ...s, sharePct: total ? Math.round((s.talkSec / total) * 1000) / 10 : 0 }));
  const n = stats.filter((s) => s.talkSec > 0).length;
  let balance = 0;
  if (n > 1 && total > 0) { const h = -stats.reduce((a, s) => (s.talkSec > 0 ? a + (s.talkSec / total) * Math.log(s.talkSec / total) : a), 0); balance = Math.round((h / Math.log(n)) * 100) / 100; }
  const spoke = new Set(stats.map((s) => s.name.toLowerCase()));
  const silent = expected.filter((e) => ![...spoke].some((s) => s === e.toLowerCase() || s.split(" ")[0] === e.toLowerCase().split(" ")[0]));
  return { totalTalkSec: total, speakers: n, dominantShare: rows[0] ? rows[0].sharePct : 0, balance, rows, silent };
}

export const fmtTalk = (sec: number) => (sec >= 3600 ? `${Math.floor(sec / 3600)}h ${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}m` : sec >= 60 ? `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, "0")}s` : `${sec}s`);
