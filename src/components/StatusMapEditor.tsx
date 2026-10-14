"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { refreshBoardAction, saveStatusMapAction } from "@/app/(app)/actions";
import { STATUS_META, STATUS_ORDER } from "@/lib/workflow";

export interface MapColumn { name: string; statuses: { name: string; auto: string | null }[] }

/** Shows the real Jira board (columns → statuses) and lets an admin override which workflow column each Jira status counts as. */
export function StatusMapEditor({ columns, initial, unit, fetchedAt, canEdit }: { columns: MapColumn[]; initial: Record<string, string>; unit: string; fetchedAt: string; canEdit: boolean }) {
  const [map, setMap] = useState(initial);
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const act = (fn: () => Promise<any>, ok: string) => start(async () => { const r = await fn(); setMsg(r.ok ? { t: ok } : { t: r.error, bad: true }); router.refresh(); });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-mute">
        <span>Estimation unit detected from the board: <b className="text-ink">{unit}</b></span>
        <span>Read {new Date(fetchedAt).toLocaleString()}</span>
        <button className="btn ml-auto px-2 py-1" disabled={pending} onClick={() => act(refreshBoardAction, "Board re-read from Jira")}><RefreshCw size={13} className={pending ? "animate-spin" : ""} /> Re-read board</button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {columns.map((c) => (
          <div key={c.name} className="rounded-xl border border-line bg-panel2 p-3">
            <div className="mb-2 text-sm font-medium">{c.name}</div>
            <ul className="space-y-1.5">
              {c.statuses.map((s) => (
                <li key={s.name} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate" title={s.name}>{s.name}</span>
                  <select className="input max-w-[150px] py-1 text-xs" disabled={!canEdit} value={map[s.name] ?? ""} onChange={(e) => setMap((m) => ({ ...m, [s.name]: e.target.value }))}>
                    <option value="">{s.auto ? `Auto: ${STATUS_META[s.auto as keyof typeof STATUS_META].label}` : "Auto: unmapped"}</option>
                    {STATUS_ORDER.map((k) => <option key={k} value={k}>{STATUS_META[k].label}</option>)}
                  </select>
                </li>))}
              {!c.statuses.length && <li className="text-xs text-mute">No statuses</li>}
            </ul>
          </div>))}
      </div>
      {canEdit && <div className="flex items-center gap-3"><button className="btn-primary" disabled={pending} onClick={() => act(() => saveStatusMapAction(Object.fromEntries(Object.entries(map).filter(([, v]) => v))), "Mapping saved. Re-sync Jira to apply it to existing cards.")}>Save mapping</button>
        {msg && <span className={`text-xs ${msg.bad ? "text-neon-red" : "text-neon-lime"}`}>{msg.t}</span>}</div>}
    </div>
  );
}
