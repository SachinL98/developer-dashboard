"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { cancelLeaveAction, decideLeaveAction } from "@/app/(app)/actions";

export interface LeaveRow { id: string; who: string; mine: boolean; type: string; range: string; days: number; half: boolean; reason: string; status: string; note: string | null; canCancel: boolean }

const statusCls: Record<string, string> = { PENDING: "border-neon-amber/40 text-neon-amber", APPROVED: "border-neon-lime/40 text-neon-lime", REJECTED: "border-neon-red/40 text-neon-red", CANCELLED: "border-line text-mute" };

export function LeaveList({ rows, canDecide, empty, showWho = true }: { rows: LeaveRow[]; canDecide: boolean; empty: string; showWho?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); setErr(r.ok ? null : r.error ?? "Failed"); router.refresh(); });
  if (!rows.length) return <p className="py-6 text-center text-sm text-mute">{empty}</p>;
  return (
    <div>
      {err && <p role="alert" className="mb-2 text-sm text-neon-red">{err}</p>}
      <ul className="divide-y divide-line/60">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {showWho && <span className="font-medium">{r.who}</span>}
                <span className="text-mute">{r.type}{r.half ? " (half day)" : ""}</span>
                <span className={clsx("chip", statusCls[r.status])}>{r.status.toLowerCase()}</span>
              </div>
              <div className="mt-0.5 font-mono text-xs text-mute">{r.range} · {r.days} working day{r.days === 1 ? "" : "s"}</div>
              {r.reason && <div className="mt-0.5 text-xs text-mute">“{r.reason}”</div>}
              {r.note && <div className="mt-0.5 text-xs text-mute">Decision note: {r.note}</div>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canDecide && r.status === "PENDING" && <>
                <input className="input h-8 w-36 text-xs" placeholder="Note (optional)" aria-label={`Decision note for ${r.who}`} maxLength={300} value={note[r.id] ?? ""} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} />
                <button className="btn-primary px-3 py-1" disabled={pending} onClick={() => run(() => decideLeaveAction(r.id, true, note[r.id]))}>Approve</button>
                <button className="btn px-3 py-1" disabled={pending} onClick={() => run(() => decideLeaveAction(r.id, false, note[r.id]))}>Reject</button></>}
              {r.canCancel && <button className="btn-ghost px-3 py-1" disabled={pending} onClick={() => confirm("Cancel this leave? Capacity is restored.") && run(() => cancelLeaveAction(r.id))}>Cancel</button>}
            </div>
          </li>))}
      </ul>
    </div>
  );
}
