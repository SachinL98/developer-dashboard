"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, UserCheck, CheckCircle2, Circle, ShieldAlert, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { runReviewAction, saveReviewAction, startReviewerPassAction } from "@/app/actions";
import type { ReviewItem } from "@/lib/review-template";

export interface ReviewView { id: string; kind: string; round: number; passed: boolean; items: ReviewItem[]; createdAt: string }

export function ReviewPanel({ ticketId, reviews, status }: { ticketId: string; reviews: ReviewView[]; status: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const initial = reviews.filter((r) => r.kind === "INITIAL_CLAUDE");
  const reviewer = reviews.filter((r) => r.kind === "REVIEWER");
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={pending} onClick={() => start(async () => { const r = await runReviewAction(ticketId); setNote(r.ok ? `New Claude review round created (${r.source})` : r.error); router.refresh(); })}>
          <Bot size={14} /> Run initial Claude review
        </button>
        {status === "REVIEW" && <button className="btn" disabled={pending} onClick={() => start(async () => { await startReviewerPassAction(ticketId); router.refresh(); })}><UserCheck size={14} /> Start reviewer pass</button>}
        {note && <span className="text-xs text-mute">{note}</span>}
      </div>
      {[...initial.slice(0, 1), ...reviewer.slice(0, 1)].map((r) => <Checklist key={r.id} ticketId={ticketId} review={r} />)}
      {!reviews.length && <p className="text-sm text-mute">No review yet. Run the initial Claude review after the PR is up; fix findings, re-run, and the card can move to Review once every critical item passes.</p>}
      {initial.length > 1 && <p className="text-xs text-mute">{initial.length - 1} earlier round(s) on record.</p>}
    </div>
  );
}

function Checklist({ ticketId, review }: { ticketId: string; review: ReviewView }) {
  const [items, setItems] = useState(review.items);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toggle = (id: string) => {
    const next = items.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i));
    setItems(next);
    start(async () => { await saveReviewAction(review.id, ticketId, next); router.refresh(); });
  };
  const crit = items.filter((i) => i.severity === "critical");
  const passed = crit.every((i) => i.checked);
  return (
    <div className="rounded-xl border border-line">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium">{review.kind === "INITIAL_CLAUDE" ? <Bot size={15} className="text-neon" /> : <UserCheck size={15} className="text-neon-amber" />}
          {review.kind === "INITIAL_CLAUDE" ? "Initial Claude review" : "Reviewer pass"} · round {review.round}</span>
        <span className={clsx("chip", passed ? "border-neon-lime/40 text-neon-lime" : "border-neon-red/40 text-neon-red")}>{passed ? "All critical clear" : `${crit.filter((i) => !i.checked).length} critical open`}</span>
      </div>
      <ul className="divide-y divide-line/60">
        {items.map((i) => (
          <li key={i.id}>
            <button onClick={() => toggle(i.id)} disabled={pending} className="flex w-full items-start gap-3 px-4 py-2 text-left text-sm hover:bg-panel2">
              {i.checked ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-neon-lime" /> : <Circle size={16} className="mt-0.5 shrink-0 text-mute" />}
              <span className="flex-1"><span className={i.checked ? "text-mute line-through decoration-line" : ""}>{i.label}</span>
                {i.note && <span className="mt-0.5 block text-xs text-neon-amber">{i.auto ? "🔎 " : ""}{i.note}</span>}</span>
              {i.severity === "critical" ? <span className="chip border-neon-red/30 text-neon-red"><ShieldAlert size={10} /> critical</span> : <span className="chip">important</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
export { RefreshCw };
