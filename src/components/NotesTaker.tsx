"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Wand2, ListTodo, Check, Download, Upload, Video } from "lucide-react";
import clsx from "clsx";
import { actionToTicketAction, importTranscriptAction, saveNotesAction, toggleActionAction } from "@/app/(app)/actions";
import { fmtTalk } from "@/lib/transcript";
import type { RichNotes } from "@/lib/notes";

export interface EngagementView {
  totalTalkSec: number; speakers: number; balance: number; dominantShare: number; label: string; durationSec: number | null;
  rows: { name: string; talkSec: number; sharePct: number; words: number; turns: number; estimated: boolean; self: boolean }[];
  hiddenRows: number; silent: string[]; source: string | null;
}
export interface MeetingView {
  id: string; title: string; kind: string; startsAt: string; transcript: string | null; summary: string | null; decisions: string[];
  actions: { id: string; text: string; owner: string | null; done: boolean; ticketKey: string | null }[];
  rich: RichNotes | null; engagement: EngagementView | null; meetUrl: string | null;
}

const mmss = (ms: number) => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

export function NotesTaker({ m, projectId, canEdit, hasMeet, aiReady = false, people = [] }: { m: MeetingView; projectId: string; canEdit: boolean; hasMeet: boolean; aiReady?: boolean; people?: string[] }) {
  const [text, setText] = useState(m.transcript ?? "");
  const [source, setSource] = useState<"upload" | "live" | "paste">("paste");
  const [listening, setListening] = useState(false);
  const [speaker, setSpeaker] = useState<string>(people[0] ?? "Speaker");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const rec = useRef<any>(null);
  const t0 = useRef(0);
  const who = useRef(speaker);
  who.current = speaker;
  const router = useRouter();

  function toggleMic() {
    if (listening) { rec.current?.stop(); setListening(false); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setMsg("Live capture needs a Chromium browser (Chrome or Edge). You can upload or paste a transcript instead."); return; }
    const r = new SR(); r.continuous = true; r.interimResults = false; r.lang = "en-GB";
    t0.current = Date.now();
    // Each phrase is stamped with the time and the speaker you have selected, so talk time can be measured.
    r.onresult = (e: any) => { const last = e.results[e.results.length - 1][0].transcript.trim(); if (!last) return; setSource("live"); setText((t) => `${t ? t + "\n" : ""}[${mmss(Date.now() - t0.current)}] ${who.current}: ${last}`); };
    r.onend = () => setListening(false);
    r.start(); rec.current = r; setListening(true);
  }

  function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 2_000_000) { setMsg("That file is too large (2 MB max)."); return; }
    const rd = new FileReader();
    rd.onload = () => { setText(String(rd.result ?? "")); setSource("upload"); setMsg(`Loaded ${f.name}. Press the button to generate notes.`); };
    rd.readAsText(f);
  }

  const e = m.engagement;
  const rich = m.rich;
  const Block = ({ title, items }: { title: string; items: string[] }) => items.length ? <div><div className="h-section mb-1 mt-4">{title}</div><ul className="list-disc space-y-1 pl-5 text-sm">{items.map((d, i) => <li key={i}>{d}</li>)}</ul></div> : null;

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="label !mb-0" htmlFor={`tr-${m.id}`}>Transcript</label>
            <div className="flex flex-wrap items-center gap-2">
              {m.meetUrl && <a href={m.meetUrl} target="_blank" rel="noreferrer" className="btn px-2 py-1" title="Google Meet cannot be shown inside another page, so it opens in its own tab. Capture or import the transcript here."><Video size={13} /> Open Meet</a>}
              <label className="btn cursor-pointer px-2 py-1"><Upload size={13} /> Upload file<input type="file" accept=".txt,.vtt,.srt,.md,text/plain,text/vtt" className="sr-only" onChange={(ev) => onFile(ev.target.files?.[0])} /></label>
              <button className={clsx("btn px-2 py-1", listening && "border-neon-red/60 text-neon-red")} onClick={toggleMic}>{listening ? <><MicOff size={13} /> Stop capture</> : <><Mic size={13} /> Live capture</>}</button>
            </div>
          </div>
          {listening && people.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-neon/30 bg-neon/5 p-2" role="radiogroup" aria-label="Who is speaking">
              <span className="text-xs text-mute">Who is speaking:</span>
              {[...people, "Speaker"].map((p) => <button key={p} role="radio" aria-checked={speaker === p} onClick={() => setSpeaker(p)} className={clsx("rounded-md border px-2 py-0.5 text-xs", speaker === p ? "border-neon bg-neon/15 text-neon" : "border-line text-mute hover:bg-panel2")}>{p.split(" ")[0]}</button>)}
            </div>
          )}
          <textarea id={`tr-${m.id}`} className="input min-h-[140px] font-mono text-[13px]" value={text} onChange={(ev) => { setText(ev.target.value); if (source !== "upload") setSource("paste"); }}
            placeholder={"Paste a Meet transcript, or type:\nAmaya: Yesterday finished ATL-101. Today starting audit log. No blockers.\nNuwan: We decided to hold usage tiers for the next sprint.\n\nTimestamps like [00:01:20] or .vtt files give exact talk times."} />
          <div className="flex flex-wrap items-center gap-3">
            {hasMeet && <button className="btn" disabled={pending} onClick={() => start(async () => { const r = await importTranscriptAction(m.id); if (r.ok) setText(""); setMsg(r.ok ? `Imported the Meet transcript (${r.chars.toLocaleString()} chars) with exact speaking times${r.ai ? ", notes written by AI" : ""}: ${r.actions} action item(s)` : r.error); router.refresh(); })}><Download size={14} /> Import from Meet</button>}
            <button className="btn-primary" disabled={pending || !text.trim()} onClick={() => start(async () => { const r = await saveNotesAction(m.id, text, source); setMsg(r.ok ? `Notes generated${r.ai ? " with AI" : ""}: ${r.actions} action item(s).${!r.ai ? (r.aiError ? ` AI failed (${r.aiError}); used the basic summary.` : " Add an AI key in Settings for smarter notes.") : ""}` : r.error); router.refresh(); })}><Wand2 size={14} /> {pending ? "Working…" : aiReady ? "Generate smart notes" : "Generate notes"}</button>
            {msg && <span className="text-xs text-mute" role="status">{msg}</span>}
          </div>
        </div>
      )}

      {m.summary && (
        <div className="rounded-xl border border-line bg-panel2 p-4">
          <div className="h-section mb-2">Summary</div>
          <p className="text-sm leading-relaxed">{m.summary}</p>
          <Block title="Key points" items={rich?.keyPoints ?? []} />
          {rich && rich.topics.length > 0 && <div><div className="h-section mb-1 mt-4">What was discussed</div><ol className="space-y-1.5 text-sm">{rich.topics.map((t, i) => <li key={i}><span className="font-medium">{t.title}.</span> <span className="text-mute">{t.summary}</span></li>)}</ol></div>}
          <Block title="Decisions" items={m.decisions} />
          {m.actions.length > 0 && <><div className="h-section mb-2 mt-4">Action items</div>
            <ul className="space-y-1.5">{m.actions.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-sm">
                <button aria-label={a.done ? "Mark as not done" : "Mark as done"} onClick={() => start(async () => { await toggleActionAction(a.id, !a.done); router.refresh(); })} className={clsx("grid h-5 w-5 shrink-0 place-items-center rounded border", a.done ? "border-neon-lime bg-neon-lime/20 text-neon-lime" : "border-line")}>{a.done && <Check size={12} />}</button>
                <span className={clsx("flex-1", a.done && "text-mute line-through")}>{a.text}</span>
                {a.owner && <span className="chip">{a.owner.split(" ")[0]}</span>}
                {a.ticketKey ? <span className="chip border-neon/40 text-neon">{a.ticketKey}</span> : <button className="btn-ghost px-2 py-0.5 text-xs" title="Create a backlog ticket from this action" disabled={pending} onClick={() => start(async () => { const r = await actionToTicketAction(a.id, projectId); setMsg(r.ok ? `Created ${r.key}` : r.error); router.refresh(); })}><ListTodo size={12} /> Ticket</button>}
              </li>))}</ul></>}
          {rich && rich.updates.length > 0 && <div><div className="h-section mb-1 mt-4">Updates by person</div><ul className="space-y-1 text-sm">{rich.updates.map((u, i) => <li key={i}><span className="font-medium">{u.person}:</span> <span className="text-mute">{u.update}</span></li>)}</ul></div>}
          <Block title="Risks" items={rich?.risks ?? []} />
          <Block title="Open questions" items={rich?.openQuestions ?? []} />
          <Block title="Next steps" items={rich?.nextSteps ?? []} />
        </div>
      )}

      {e && e.totalTalkSec > 0 && (
        <div className="rounded-xl border border-line p-4">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <div className="h-section">Who spoke</div>
            <span className="chip" title="How evenly the speaking time was shared">{e.label}</span>
          </div>
          <p className="mb-3 text-xs text-mute">{e.speakers} {e.speakers === 1 ? "person" : "people"} spoke for {fmtTalk(e.totalTalkSec)} in total{e.durationSec ? ` of a ${Math.round(e.durationSec / 60)}-minute call` : ""}. The most active person had {Math.round(e.dominantShare)}% of the talk time.{e.hiddenRows > 0 ? " Other people's individual times are visible to leads and admins only." : ""}</p>
          <ul className="space-y-2">
            {e.rows.map((r) => (
              <li key={r.name} className="text-sm">
                <div className="mb-0.5 flex items-center justify-between gap-2"><span>{r.name}{r.self && <span className="ml-2 chip">you</span>}</span><span className="text-xs text-mute">{fmtTalk(r.talkSec)} · {r.sharePct}% · {r.turns} turn{r.turns === 1 ? "" : "s"}{r.estimated ? " · estimated" : ""}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-neon" style={{ width: `${Math.min(100, r.sharePct)}%` }} /></div>
              </li>))}
          </ul>
          {e.silent.length > 0 && <p className="mt-3 text-xs text-mute">Invited but did not speak: {e.silent.join(", ")}.</p>}
          {e.rows.some((r) => r.estimated) && <p className="mt-2 text-xs text-mute">Times marked estimated come from word counts because the transcript has no timestamps. Import from Meet, upload a .vtt file, or use Live capture for exact times.</p>}
        </div>
      )}
    </div>
  );
}
