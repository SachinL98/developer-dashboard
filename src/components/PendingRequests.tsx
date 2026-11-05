"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveSignupAction, rejectSignupAction } from "@/app/(app)/actions";

export interface PendingRow { id: string; name: string; email: string; jobTitle: string; when: string }

export function PendingRequests({ rows }: { rows: PendingRow[] }) {
  const [role, setRole] = useState<Record<string, "DEVELOPER" | "LEAD" | "ADMIN">>({});
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!rows.length) return null;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); setErr(r.ok ? null : r.error ?? "Failed"); router.refresh(); });
  return (
    <div className="card-pad space-y-3 border-neon-amber/40">
      <div><div className="h-section">Waiting for approval · {rows.length}</div><p className="text-sm text-mute">These people asked for an account. Approve only people you recognise. The email is not verified, so check the name matches the address.</p></div>
      {err && <p role="alert" className="text-sm text-neon-red">{err}</p>}
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1"><div className="text-sm font-medium">{r.name} <span className="font-normal text-mute">· {r.jobTitle}</span></div><div className="text-xs text-mute">{r.email} · asked {r.when}</div></div>
            <select className="input w-32" aria-label={`Role for ${r.name}`} value={role[r.id] ?? "DEVELOPER"} onChange={(e) => setRole({ ...role, [r.id]: e.target.value as "DEVELOPER" | "LEAD" | "ADMIN" })}>
              <option value="DEVELOPER">Developer</option><option value="LEAD">Lead</option><option value="ADMIN">Admin</option></select>
            <button className="btn-primary" disabled={pending} onClick={() => run(() => approveSignupAction(r.id, role[r.id] ?? "DEVELOPER"))}>Approve</button>
            <button className="btn" disabled={pending} onClick={() => { if (confirm(`Reject the request from ${r.name}?`)) run(() => rejectSignupAction(r.id)); }}>Reject</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
