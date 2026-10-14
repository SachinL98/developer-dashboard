"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Wand2, ListTodo, Check, Download } from "lucide-react";
import clsx from "clsx";
import { actionToTicketAction, importTranscriptAction, saveNotesAction, toggleActionAction } from "@/app/(app)/actions";

export interface MeetingView {
  id: string; title: string; kind: string; startsAt: string; transcript: string | null; summary: string | null; decisions: string[];
  actions: { id: string; text: string; owner: string | null; done: boolean; ticketKey: string | null }[];
}

export function NotesTaker({ m, projectId, canEdit, hasMeet }: { m: MeetingView; projectId: string; canEdit: boolean; hasMeet: boolean }) {
  const [text, setText] = useState(m.transcript ?? "");
  const [listening, setListening] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const rec = useRef<any>(null);
  const router = useRouter();

  function toggleMic() {
    if (listening) { rec.current?.stop(); setListening(false); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setMsg("Live capture needs a Chromium browser. Paste the Meet transcript instead."); return; }
    const r = new SR(); r.continuous = true; r.interimResults = false; r.lang = "en-GB";
    r.onresult = (e: any) => { const last = e.results[e.results.length - 1][0].transcript.trim(); setText((t) => (t ? t + "\n" : "") + last); };
    r.onend = () => setListening(false);
    r.start(); rec.current = r; setListening(true);
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div>
          <div className="mb-1 flex items-center justify-between"><label className="label !mb-0">Transcript / raw notes</label>
            <button className={clsx("btn px-2 py-1", listening && "border-neon-red/60 text-neon-red")} onClick={toggleMic}>{listening ? <><MicOff size={13} /> Stop capture</> : <><Mic size={13} /> Live capture</>}</button></div>
          <textarea className="input min-h-[140px] font-mono text-[13px]" value={text} onChange={(e) => setText(e.target.value)}
            placeholder={"Amaya: Yesterday finished ATL-101. Today starting audit log. No blockers.\nNuwan: We decided to hold usage tiers for the next sprint.\nDilini: I'll write the tenant migration tomorrow."} />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {hasMeet && <button className="btn" disabled={pending} onClick={() => start(async () => { const r = await importTranscriptAction(m.id); if (r.ok) setText(""); setMsg(r.ok ? `Imported the Meet transcript (${r.chars.toLocaleString()} chars) and generated notes: ${r.actions} action item(s)` : r.error); router.refresh(); })}><Download size={14} /> Import Meet transcript</button>}
            <button className="btn-primary" disabled={pending || !text.trim()} onClick={() => start(async () => { const r = await saveNotesAction(m.id, text); setMsg(r.ok ? `Notes generated: ${r.actions} action item(s)` : r.error); router.refresh(); })}><Wand2 size={14} /> Generate notes</button>
            {msg && <span className="text-xs text-mute">{msg}</span>}
          </div>
        </div>
      )}
      {m.summary && (
        <div className="rounded-xl border border-line bg-panel2 p-4">
          <div className="h-section mb-2">Summary</div>
          <p className="text-sm leading-relaxed">{m.summary}</p>
          {m.decisions.length > 0 && <><div className="h-section mb-1 mt-4">Decisions</div><ul className="list-disc space-y-1 pl-5 text-sm">{m.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul></>}
          {m.actions.length > 0 && <><div className="h-section mb-2 mt-4">Action items</div>
            <ul className="space-y-1.5">{m.actions.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-sm">
                <button onClick={() => start(async () => { await toggleActionAction(a.id, !a.done); router.refresh(); })} className={clsx("grid h-5 w-5 shrink-0 place-items-center rounded border", a.done ? "border-neon-lime bg-neon-lime/20 text-neon-lime" : "border-line")}>{a.done && <Check size={12} />}</button>
                <span className={clsx("flex-1", a.done && "text-mute line-through")}>{a.text}</span>
                {a.owner && <span className="chip">{a.owner.split(" ")[0]}</span>}
                {a.ticketKey ? <span className="chip border-neon/40 text-neon">{a.ticketKey}</span> : <button className="btn-ghost px-2 py-0.5 text-xs" title="Create a backlog ticket from this action" disabled={pending} onClick={() => start(async () => { const r = await actionToTicketAction(a.id, projectId); setMsg(r.ok ? `Created ${r.key}` : r.error); router.refresh(); })}><ListTodo size={12} /> Ticket</button>}
              </li>))}</ul></>}
        </div>
      )}
    </div>
  );
}
