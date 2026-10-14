"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { GitPullRequest, Clock, Flame, Lock, ArrowRight } from "lucide-react";
import { moveTicketAction } from "@/app/actions";
import { STATUS_META, STATUS_ORDER, TYPE_META, PRIORITY_META, allowedNext, type StatusKey } from "@/lib/workflow";
import { Avatar, Progress } from "./ui";

export interface BoardTicket {
  id: string; key: string; title: string; status: StatusKey; type: keyof typeof TYPE_META; priority: keyof typeof PRIORITY_META;
  points: number | null; estimateHrs: number | null; loggedHrs: number; progressPct: number; prNumber: number | null; prState: string | null;
  assignee: { name: string; hue: number } | null; project: { key: string; color: string }; complicated: boolean;
}

export function Board({ tickets: initial, readOnlyHint }: { tickets: BoardTicket[]; readOnlyHint?: string }) {
  const [tickets, setTickets] = useState(initial);
  const [drag, setDrag] = useState<BoardTicket | null>(null);
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null);
  const [, start] = useTransition();
  const [q, setQ] = useState("");
  const [who, setWho] = useState("all");
  const people = useMemo(() => [...new Set(tickets.map((t) => t.assignee?.name).filter(Boolean))] as string[], [tickets]);

  const say = (msg: string, bad = false) => { setToast({ msg, bad }); setTimeout(() => setToast(null), 4200); };
  function move(t: BoardTicket, to: StatusKey) {
    const prev = tickets;
    if (t.status === to) return;
    setTickets((xs) => xs.map((x) => (x.id === t.id ? { ...x, status: to } : x))); // optimistic
    start(async () => {
      const r = await moveTicketAction(t.id, to);
      if (!r.ok) { setTickets(prev); say(r.error, true); } else say(`${t.key} → ${r.label}${r.syncError ? " (Jira sync failed: " + r.syncError.slice(0, 80) + ")" : ""}`);
    });
  }

  const visible = tickets.filter((t) => (who === "all" || t.assignee?.name === who) && (!q || (t.key + t.title).toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input className="input max-w-xs" placeholder="Filter cards…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input max-w-[200px]" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="all">Everyone</option>{people.map((p) => <option key={p}>{p}</option>)}
        </select>
        <span className="text-xs text-mute">{readOnlyHint ?? "Drag a card forward, or use the → button. Backward moves are disabled."}</span>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
        <div className="flex gap-3" style={{ minWidth: STATUS_ORDER.length * 268 }}>
          {STATUS_ORDER.map((s) => {
            const meta = STATUS_META[s];
            const col = visible.filter((t) => t.status === s);
            const droppable = !!drag && allowedNext(drag.status).includes(s);
            const blocked = !!drag && drag.status !== s && !droppable;
            return (
              <div key={s} onDragOver={(e) => droppable && e.preventDefault()} onDrop={() => { if (drag && droppable) move(drag, s); setDrag(null); }}
                className={clsx("w-[256px] shrink-0 rounded-2xl border bg-panel/60 p-2 transition", droppable ? "border-neon shadow-glow" : "border-line", blocked && "opacity-40")}>
                <div className="mb-2 flex items-center justify-between px-2 pt-1" title={meta.hint}>
                  <span className="flex items-center gap-2 text-sm font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />{meta.label}</span>
                  <span className="rounded-md bg-panel2 px-1.5 font-mono text-xs text-mute">{col.length}</span>
                </div>
                <div className="space-y-2">
                  {col.map((t) => <Card key={t.id} t={t} onDragStart={() => setDrag(t)} onDragEnd={() => setDrag(null)} onMove={(to) => move(t, to)} />)}
                  {!col.length && <div className="rounded-xl border border-dashed border-line/70 p-4 text-center text-xs text-mute/70">{drag ? (droppable ? "Drop here" : <Lock size={14} className="mx-auto" />) : "Empty"}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {toast && <div className={clsx("fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border px-4 py-3 text-sm shadow-2xl fade-in", toast.bad ? "border-neon-red/50 bg-[#2a1018] text-neon-red" : "border-neon-lime/40 bg-[#101c10] text-neon-lime")}>{toast.msg}</div>}
    </>
  );
}

function Card({ t, onDragStart, onDragEnd, onMove }: { t: BoardTicket; onDragStart: () => void; onDragEnd: () => void; onMove: (to: StatusKey) => void }) {
  const next = allowedNext(t.status);
  const over = t.estimateHrs ? t.loggedHrs > t.estimateHrs : false;
  return (
    <div draggable={next.length > 0} onDragStart={onDragStart} onDragEnd={onDragEnd}
      className="group cursor-grab rounded-xl border border-line bg-panel2 p-3 transition hover:border-neon/40 active:cursor-grabbing" style={{ borderLeft: `3px solid ${t.project.color}` }}>
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-mono text-mute">{t.key}</span>
        <span className="flex items-center gap-1.5">
          {t.complicated && <Flame size={12} className="text-neon-amber" aria-label="Needs grooming" />}
          <span style={{ color: PRIORITY_META[t.priority].color }}>▲</span>
          <span className="rounded px-1 py-px" style={{ color: TYPE_META[t.type].color, background: TYPE_META[t.type].color + "18" }}>{TYPE_META[t.type].label}</span>
        </span>
      </div>
      <Link href={`/tickets/${t.id}`} className="mt-1.5 block text-sm leading-snug hover:text-white">{t.title}</Link>
      {t.status === "IN_PROGRESS" && <div className="mt-2"><Progress pct={t.progressPct} color="#a78bfa" /><div className="mt-1 text-right font-mono text-[10px] text-mute">{t.progressPct}%</div></div>}
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] text-mute">
          {t.points != null && <span className="rounded bg-line px-1.5 font-mono text-ink">{t.points}</span>}
          {t.estimateHrs != null && <span className={clsx("flex items-center gap-1", over && "text-neon-red")}><Clock size={11} />{t.loggedHrs.toFixed(1)}/{t.estimateHrs}h</span>}
          {t.prNumber && <span className="flex items-center gap-1"><GitPullRequest size={11} />#{t.prNumber}</span>}
        </div>
        <div className="flex items-center gap-1">
          {next.map((n) => (
            <button key={n} onClick={() => onMove(n)} title={`Move to ${STATUS_META[n].label}`} className="rounded-md p-1 text-mute opacity-0 transition hover:bg-line hover:text-white group-hover:opacity-100" style={{ color: n === "FAILED_STG" ? "#fb7185" : undefined }}>
              <ArrowRight size={13} />
            </button>
          ))}
          {t.assignee && <Avatar name={t.assignee.name} hue={t.assignee.hue} size={22} />}
        </div>
      </div>
    </div>
  );
}
