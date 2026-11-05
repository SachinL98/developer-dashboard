"use client";
import { useState, useTransition } from "react";
import { resetPasswordAction, setAccessAction, setActiveAction, setPersonEmailAction, mergePersonAction } from "@/app/(app)/actions";
import { CopyText } from "./CopyText";
import { Avatar } from "./ui";

export function UserRow({ user, self, jira, google, last }: { user: { id: string; name: string; email: string; access: string; active: boolean; hue: number; ver?: number; jiraOnly?: boolean; placeholder?: boolean; accounts?: { id: string; name: string }[] }; self: boolean; jira: boolean; google: boolean; last: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [temp, setTemp] = useState<string | null>(null);
  const [mail, setMail] = useState("");
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); setErr(r.ok ? null : r.error ?? "Failed"); });
  return (
    <tr className={`border-t border-line/60 ${user.active ? "" : "opacity-50"}`}>
      <td className="p-3"><div className="flex items-center gap-3"><Avatar name={user.name} hue={user.hue} id={user.id} ver={user.ver} size={28} /><div><div>{user.name}{self && <span className="ml-2 chip">you</span>}</div><div className="text-xs text-mute">{user.placeholder ? "email hidden by Jira" : user.email}{user.jiraOnly && <span className="ml-2 chip">From Jira · not signed up</span>}</div>{user.jiraOnly && (user.accounts?.length ?? 0) > 0 && <select className="input mt-1 h-7 w-52 py-0 text-xs" aria-label={`Same person as an existing account: ${user.name}`} defaultValue="" disabled={pending} onChange={(e) => { const v = e.target.value; if (v && confirm(`Merge "${user.name}" (from Jira) into ${user.accounts!.find((a) => a.id === v)?.name}? Their tickets move to that account and this entry is removed.`)) run(() => mergePersonAction(user.id, v)); else e.target.value = ""; }}><option value="">Same person as an account…</option>{user.accounts!.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}{user.placeholder && <div className="mt-1 flex gap-1"><input className="input h-7 w-44 text-xs" placeholder="Their real email" aria-label={`Email for ${user.name}`} value={mail} onChange={(e) => setMail(e.target.value)} /><button className="btn px-2 py-0.5 text-xs" disabled={pending || !mail.includes("@")} onClick={() => run(() => setPersonEmailAction(user.id, mail))}>Save</button></div>}</div></div></td>
      <td><select className="input w-32" value={user.access} disabled={pending} onChange={(e) => run(() => setAccessAction(user.id, e.target.value as any))}>
        <option value="DEVELOPER">Developer</option><option value="LEAD">Lead</option><option value="ADMIN">Admin</option></select>
        {err && <div className="mt-1 text-xs text-neon-red">{err}</div>}</td>
      <td className={jira ? "text-neon-lime" : "text-mute"}>{jira ? "connected" : "—"}</td>
      <td className={google ? "text-neon-lime" : "text-mute"}>{google ? "connected" : "—"}</td>
      <td className="text-xs text-mute">{last}</td>
      <td className="pr-3 text-right">
        <div className="flex flex-wrap justify-end gap-2">
          {!user.jiraOnly && <button className="btn" disabled={pending || self} title="Create a new one-time password" onClick={() => { if (confirm(`Reset the password for ${user.name}? They will be signed out everywhere.`)) start(async () => { const r = await resetPasswordAction(user.id); if (r.ok) { setTemp(r.tempPassword); setErr(null); } else setErr(r.error); }); }}>Reset password</button>}
          <button className="btn" disabled={pending || self} onClick={() => run(() => setActiveAction(user.id, !user.active))}>{user.active ? "Deactivate" : "Reactivate"}</button>
        </div>
        {temp && <div className="mt-2 text-left"><CopyText label="One-time password" value={temp} /></div>}
      </td>
    </tr>
  );
}
