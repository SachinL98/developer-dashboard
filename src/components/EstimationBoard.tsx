"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Eye, EyeOff, Sparkles, Check, RotateCcw, Flame } from "lucide-react";
import { applyEstimateAction, clearVotesAction, voteAction } from "@/app/(app)/actions";
import { POKER_HOURS, STORY_POINTS } from "@/lib/workflow";
import { summarisePoker, type Suggestion } from "@/lib/estimation";

export interface EstTicket {
  id: string; key: string; title: string; description: string; type: string; points: number | null; estimateHrs: number | null; complicated: boolean;
  suggestion: Suggestion; votes: { dev: string; hours: number; mine: boolean }[]; myVote: number | null;
}
const pointsFor = (h: number) => STORY_POINTS.find((p) => h <= p * 2.5) ?? 13;

export function EstimationBoard({ tickets, devCount, canLead }: { tickets: EstTicket[]; devCount: number; canLead: boolean }) {
  const [sel, setSel] = useState(tickets[0]?.id);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = tickets.find((x) => x.id === sel);
  const run = (fn: () => Promise<any>) => start(async () => { await fn(); router.refresh(); });
  const summary = t ? summarisePoker(t.votes.map((v) => v.hours)) : null;
  const shown = t ? reveal[t.id] : false;

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="card-pad max-h-[760px] overflow-y-auto xl:col-span-1">
        <div className="h-section mb-3">To estimate · {tickets.length}</div>
        <ul className="space-y-1.5">
          {tickets.map((x) => (
            <li key={x.id}><button onClick={() => setSel(x.id)} className={clsx("flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm", x.id === sel ? "border-neon/60 bg-neon/10" : "border-line hover:border-line/80 hover:bg-panel2")}>
              <span className="min-w-0 flex-1 truncate"><span className="font-mono text-xs text-mute">{x.key}</span> {x.title}</span>
              {x.complicated && <Flame size={13} className="text-neon-amber" />}
              <span className="font-mono text-xs text-mute">{x.estimateHrs != null ? `${x.estimateHrs}h` : `${x.votes.length}/${devCount}`}</span>
            </button></li>
          ))}
          {!tickets.length && <li className="py-8 text-center text-sm text-mute">Everything in the sprint has an estimate. 🎉</li>}
        </ul>
      </div>

      {t && summary && (
        <div className="space-y-6 xl:col-span-2">
          <div className="card-pad">
            <div className="flex items-start justify-between gap-3">
              <div><Link href={`/tickets/${t.id}`} className="text-lg font-semibold hover:text-neon">{t.title}</Link><div className="font-mono text-xs text-mute">{t.key} · {t.type.toLowerCase()}{t.points ? ` · ${t.points} pts` : ""}</div></div>
              {t.estimateHrs != null && <span className="chip border-neon-lime/40 text-neon-lime"><Check size={11} /> {t.estimateHrs}h agreed</span>}
            </div>
            <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm text-mute">{t.description || "No description."}</p>
          </div>

          <div className="card-pad">
            <div className="h-section mb-3 flex items-center gap-2"><Sparkles size={14} className="text-neon-violet" /> History-based suggestion</div>
            <div className="flex flex-wrap items-center gap-6">
              <div><div className="font-mono text-3xl">{t.suggestion.hours}<span className="text-base text-mute">h</span></div><div className="text-xs text-mute">range {t.suggestion.low}–{t.suggestion.high}h · {t.suggestion.confidence} confidence</div></div>
              <p className="min-w-[200px] flex-1 text-xs text-mute">{t.suggestion.basis}</p>
              <button className="btn" disabled={pending || !canLead} title={canLead ? "" : "Leads apply the agreed estimate"} onClick={() => run(() => applyEstimateAction(t.id, t.suggestion.hours, t.points ?? pointsFor(t.suggestion.hours)))}>Apply {t.suggestion.hours}h</button>
            </div>
          </div>

          <div className="card-pad">
            <div className="mb-3 flex items-center justify-between">
              <span className="h-section">Planning poker (hours)</span>
              <div className="flex gap-2">
                <button className="btn px-2 py-1" onClick={() => setReveal((r) => ({ ...r, [t.id]: !r[t.id] }))}>{shown ? <><EyeOff size={13} /> Hide</> : <><Eye size={13} /> Reveal ({t.votes.length}/{devCount})</>}</button>
                <button className="btn px-2 py-1" disabled={pending || !canLead} onClick={() => run(() => clearVotesAction(t.id))}><RotateCcw size={13} /> New round</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {POKER_HOURS.map((h) => (
                <button key={h} disabled={pending} onClick={() => run(() => voteAction(t.id, h))}
                  className={clsx("h-16 w-12 rounded-xl border font-mono text-lg transition hover:-translate-y-1", t.myVote === h ? "border-neon bg-neon/15 text-neon shadow-glow" : "border-line bg-panel2 hover:border-neon/50")}>{h}</button>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              {t.votes.map((v) => (
                <div key={v.dev} className="w-20 rounded-xl border border-line bg-panel2 p-2 text-center">
                  <div className="font-mono text-xl">{shown || v.mine ? v.hours : "?"}</div><div className="truncate text-[10px] text-mute">{v.dev.split(" ")[0]}</div>
                </div>))}
              {!t.votes.length && <span className="text-sm text-mute">No votes yet. Vote above, then reveal when everyone is in.</span>}
            </div>
            {shown && t.votes.length > 0 && (
              <div className="mt-5 flex flex-wrap items-center gap-6 rounded-xl border border-line p-4">
                <div><div className="text-xs text-mute">Median</div><div className="font-mono text-2xl">{summary.median}h</div></div>
                <div><div className="text-xs text-mute">Range</div><div className="font-mono text-2xl">{summary.min}–{summary.max}h</div></div>
                <div className={clsx("rounded-full px-3 py-1 text-xs", summary.consensus ? "bg-neon-lime/15 text-neon-lime" : "bg-neon-amber/15 text-neon-amber")}>{summary.consensus ? "Consensus" : "Wide spread — discuss, then re-vote"}</div>
                <button className="btn-primary ml-auto" disabled={pending || !canLead} title={canLead ? "" : "Leads apply the agreed estimate"} onClick={() => run(() => applyEstimateAction(t.id, summary.median, pointsFor(summary.median)))}>Apply {summary.median}h ({pointsFor(summary.median)} pts)</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
