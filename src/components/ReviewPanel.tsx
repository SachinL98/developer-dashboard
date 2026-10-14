"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, UserCheck, CheckCircle2, Circle, ShieldAlert, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import { runReviewAction, saveReviewAction, startReviewerPassAction } from "@/app/(app)/actions";
import type { ReviewItem } from "@/lib/review-template";
import type { Finding } from "@/lib/claude-review";

export interface ReviewView {
  id: string; kind: string; round: number; passed: boolean; items: ReviewItem[]; createdAt: string;
  status: string; source: string | null; summary: string | null; findings: Finding[]; model: string | null; error: string | null; truncated: boolean; trigger: string | null;
}
const SEV: Record<string, string> = { critical: "border-neon-red/40 text-neon-red", important: "border-neon-amber/40 text-neon-amber", minor: "border-line text-mute" };

export function ReviewPanel({ ticketId, reviews, status, canLead }: { ticketId: string; reviews: ReviewView[]; status: string; canLead: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const initial = reviews.filter((r) => r.kind === "INITIAL_CLAUDE");
  const reviewer = reviews.filter((r) => r.kind === "REVIEWER");
  const running = initial.some((r) => r.status === "RUNNING");
  // After a click the new round shows up a moment later; keep refreshing until it has finished.
  const [watchFrom, setWatchFrom] = useState<number | null>(null);
  const [initialCount, setInitialCount] = useState<number | null>(null);
  const watching = watchFrom !== null && Date.now() - watchFrom < 180_000 && (initial.length === 0 || running || initial.length <= (initialCount ?? 0));
  useEffect(() => {
    if (!running && !watching) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [running, watching, router]);
  useEffect(() => { if (watchFrom !== null && !running && initial.length > (initialCount ?? 0)) setWatchFrom(null); }, [running, initial.length, initialCount, watchFrom]);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={pending || running} onClick={() => start(async () => { setInitialCount(initial.length); setWatchFrom(Date.now()); const r = await runReviewAction(ticketId); setNote(r.ok ? "Claude is reviewing the pull request…" : r.error); router.refresh(); })}>
          {running ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />} {initial.length ? "Re-run Claude review" : "Run initial Claude review"}
        </button>
        {status === "REVIEW" && canLead && <button className="btn" disabled={pending} onClick={() => start(async () => { await startReviewerPassAction(ticketId); router.refresh(); })}><UserCheck size={14} /> Start reviewer pass</button>}
        {note && <span className="text-xs text-mute">{note}</span>}
      </div>
      {[...initial.slice(0, 1), ...reviewer.slice(0, 1)].map((r) => <Checklist key={r.id + r.status} ticketId={ticketId} review={r} canLead={canLead} />)}
      {!reviews.length && <p className="text-sm text-mute">No review yet. It runs automatically when the card moves to Initial Review with a PR linked, and again whenever new commits are pushed. Fix findings; the card can move to Review once every critical item passes.</p>}
      {initial.length > 1 && <p className="text-xs text-mute">{initial.length - 1} earlier round(s) on record.</p>}
    </div>
  );
}

function Checklist({ ticketId, review, canLead }: { ticketId: string; review: ReviewView; canLead: boolean }) {
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
        {review.status === "RUNNING" ? <span className="chip border-neon/40 text-neon"><Loader2 size={11} className="animate-spin" /> Reviewing…</span>
          : review.status === "ERROR" ? <span className="chip border-neon-red/40 text-neon-red"><AlertTriangle size={11} /> Review failed</span>
          : <span className={clsx("chip", review.passed ? "border-neon-lime/40 text-neon-lime" : "border-neon-red/40 text-neon-red")}>{review.passed ? "Passed" : `Blocked · ${crit.filter((i) => !i.checked).length} critical open${review.findings.some((f) => f.severity === "critical") ? " + critical findings" : ""}`}</span>}
      </div>
      {(review.summary || review.error || review.findings.length > 0) && (
        <div className="space-y-3 border-b border-line px-4 py-3 text-sm">
          {review.error && <p className="text-neon-red">{review.error} Use “Re-run” to try again.</p>}
          {review.summary && <p className="text-mute">{review.summary}</p>}
          {review.truncated && <p className="text-xs text-neon-amber">The diff was very large, so only the first part was reviewed.</p>}
          {review.findings.length > 0 && (
            <ul className="space-y-2">{review.findings.map((f, i) => (
              <li key={i} className="flex gap-2"><span className={clsx("chip h-fit shrink-0", SEV[f.severity])}>{f.severity}</span>
                <span><span className="font-medium">{f.title}</span>{f.file && <code className="ml-2 text-xs text-mute">{f.file}{f.line ? `:${f.line}` : ""}</code>}<span className="block text-xs text-mute">{f.detail}</span></span></li>))}</ul>)}
          <p className="text-[11px] text-mute">{review.source === "claude" ? `Reviewed by Claude${review.model ? ` (${review.model})` : ""}` : review.source === "diff scan" ? "Heuristic diff scan, not an AI review" : review.source === "manual" ? "Manual checklist" : ""}{review.trigger ? ` · started by ${review.trigger === "move" ? "moving the card" : review.trigger === "push" ? "new commits" : "a person"}` : ""}. {review.kind === "INITIAL_CLAUDE" && review.source !== "manual" && !canLead ? "Only a lead can override items." : ""}</p>
        </div>)}
      <ul className="divide-y divide-line/60">
        {items.map((i) => (
          <li key={i.id}>
            <button onClick={() => toggle(i.id)} disabled={pending || review.status === "RUNNING"} className="flex w-full items-start gap-3 px-4 py-2 text-left text-sm hover:bg-panel2">
              {i.checked ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-neon-lime" /> : <Circle size={16} className="mt-0.5 shrink-0 text-mute" />}
              <span className="flex-1"><span className={i.checked ? "text-mute line-through decoration-line" : ""}>{i.label}</span>{i.project && <span className="chip ml-2">project</span>}
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
