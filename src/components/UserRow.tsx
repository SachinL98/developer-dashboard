"use client";
import { useState, useTransition } from "react";
import { setAccessAction, setActiveAction } from "@/app/(app)/actions";
import { Avatar } from "./ui";

export function UserRow({ user, self, jira, google, last }: { user: { id: string; name: string; email: string; access: string; active: boolean; hue: number }; self: boolean; jira: boolean; google: boolean; last: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); setErr(r.ok ? null : r.error ?? "Failed"); });
  return (
    <tr className={`border-t border-line/60 ${user.active ? "" : "opacity-50"}`}>
      <td className="p-3"><div className="flex items-center gap-3"><Avatar name={user.name} hue={user.hue} size={28} /><div><div>{user.name}{self && <span className="ml-2 chip">you</span>}</div><div className="text-xs text-mute">{user.email}</div></div></div></td>
      <td><select className="input w-32" value={user.access} disabled={pending} onChange={(e) => run(() => setAccessAction(user.id, e.target.value as any))}>
        <option value="DEVELOPER">Developer</option><option value="LEAD">Lead</option><option value="ADMIN">Admin</option></select>
        {err && <div className="mt-1 text-xs text-neon-red">{err}</div>}</td>
      <td className={jira ? "text-neon-lime" : "text-mute"}>{jira ? "connected" : "—"}</td>
      <td className={google ? "text-neon-lime" : "text-mute"}>{google ? "connected" : "—"}</td>
      <td className="text-xs text-mute">{last}</td>
      <td className="pr-3 text-right"><button className="btn" disabled={pending || self} onClick={() => run(() => setActiveAction(user.id, !user.active))}>{user.active ? "Deactivate" : "Reactivate"}</button></td>
    </tr>
  );
}
