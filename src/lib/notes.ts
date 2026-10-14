// Automated meeting notes: structure a transcript / raw notes into summary, decisions, action items.
export interface NoteResult {
  summary: string; decisions: string[]; actionItems: { text: string; owner?: string; ticketKey?: string }[];
  blockers: string[]; ticketsMentioned: string[]; speakers: string[]; standup?: { name: string; yesterday: string; today: string; blockers: string }[];
}

const KEY_RE = /\b([A-Z][A-Z0-9]{1,9}-\d+)\b/g;
const ACTION_RE = /(?:^|\b)(action(?: item)?s?:|todo:|to-?do:|will\b|i'll\b|we'll\b|need(?:s)? to\b|should\b|must\b|going to\b|let's\b|please\b|follow[- ]up)/i;
const DECISION_RE = /\b(decided|agreed|we(?:'ll| will) go with|decision:|approved|going with|settled on|resolved to)\b/i;
const BLOCK_RE = /\b(blocked|blocker|waiting (?:on|for)|stuck|can't proceed|depends on)\b/i;

const clean = (s: string) => s.replace(/^[-*•\d.)\s]+/, "").replace(/\s+/g, " ").trim();

export function parseNotes(raw: string, knownNames: string[] = []): NoteResult {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const speakers = new Set<string>();
  const turns: { who?: string; text: string }[] = lines.map((l) => {
    const m = l.match(/^(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*)?([A-Z][\w.' -]{1,28}):\s+(.*)$/);
    if (m && !/^(action|todo|decision|blocker|yesterday|today|note)/i.test(m[1])) { speakers.add(m[1].trim()); return { who: m[1].trim(), text: m[2] }; }
    return { text: l };
  });

  const actionItems: NoteResult["actionItems"] = [];
  const decisions: string[] = [], blockers: string[] = [];
  const seen = new Set<string>();
  for (const t of turns) {
    const sentences = t.text.split(/(?<=[.!?])\s+/);
    for (const s0 of sentences) {
      const s = clean(s0);
      if (s.length < 6 || seen.has(s.toLowerCase())) continue;
      if (DECISION_RE.test(s)) { decisions.push(s); seen.add(s.toLowerCase()); continue; }
      if (BLOCK_RE.test(s)) { blockers.push(s); seen.add(s.toLowerCase()); }
      if (ACTION_RE.test(s) && !/^(yeah|ok|okay|yes|no)\b/i.test(s)) {
        const mention = knownNames.find((n) => new RegExp(`\\b${n.split(" ")[0]}\\b`, "i").test(s));
        const owner = /\b(i'll|i will|i am going to|i'm going to)\b/i.test(s) ? t.who : mention ?? t.who;
        const key = s.match(KEY_RE)?.[0];
        actionItems.push({ text: s.replace(/^(action(?: item)?s?|todo|to-?do):\s*/i, ""), owner, ticketKey: key });
        seen.add(s.toLowerCase());
      }
    }
  }

  // Standup shape: "Name: yesterday ..., today ..., blockers ..."
  const standup: NonNullable<NoteResult["standup"]> = [];
  for (const t of turns) {
    if (!t.who) continue;
    const y = t.text.match(/yesterday[:,]?\s*(.*?)(?=(?:\btoday\b|\bblock|$))/i)?.[1]?.trim();
    const td = t.text.match(/today[:,]?\s*(.*?)(?=(?:\bno blocker|\bblock|$))/i)?.[1]?.trim();
    const none = /\bno blockers?\b|\bnothing blocking\b/i.test(t.text);
    const b = none ? "" : t.text.match(/\bblock(?:ers|er|ed)?\b[:,]?\s*(.*)$/i)?.[1]?.trim();
    if (y || td) standup.push({ name: t.who, yesterday: y ?? "", today: td ?? "", blockers: b && !/^(none|no|nothing)\b/i.test(b) ? b : "" });
  }

  const tickets = [...new Set([...raw.matchAll(KEY_RE)].map((m) => m[1]))];
  const lead = turns.slice(0, 3).map((t) => clean(t.text)).join(" ").slice(0, 220);
  const summary = [
    lead ? `${lead}${lead.length >= 220 ? "…" : ""}` : "No content captured.",
    speakers.size ? `Participants: ${[...speakers].join(", ")}.` : "",
    `${decisions.length} decision(s), ${actionItems.length} action item(s), ${blockers.length} blocker(s)${tickets.length ? `; tickets discussed: ${tickets.join(", ")}` : ""}.`,
  ].filter(Boolean).join(" ");

  return { summary, decisions, actionItems, blockers, ticketsMentioned: tickets, speakers: [...speakers], standup: standup.length ? standup : undefined };
}

/** Optional LLM pass – used when ANTHROPIC_API_KEY is set; otherwise heuristic result is returned. */
export async function summariseWithClaude(raw: string, fallback: NoteResult): Promise<NoteResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return fallback;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 1500,
        system: "You turn dev-team meeting transcripts into structured notes. Reply with ONLY JSON: {summary:string, decisions:string[], actionItems:{text:string,owner?:string,ticketKey?:string}[], blockers:string[]}.",
        messages: [{ role: "user", content: raw.slice(0, 60_000) }],
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const text: string = data.content?.[0]?.text ?? "";
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return { ...fallback, summary: json.summary ?? fallback.summary, decisions: json.decisions ?? fallback.decisions, actionItems: json.actionItems ?? fallback.actionItems, blockers: json.blockers ?? fallback.blockers };
  } catch { return fallback; }
}
