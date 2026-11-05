"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { createUserAction } from "@/app/(app)/actions";
import { CopyText } from "@/components/CopyText";

export function AddUserForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [access, setAccess] = useState<"DEVELOPER" | "LEAD" | "ADMIN">("DEVELOPER");
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<{ email: string; pw: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const submit = () => start(async () => {
    setErr(null);
    const r = await createUserAction({ name, email, access });
    if (!r.ok) { setErr(r.error); return; }
    setMade({ email: r.email, pw: r.tempPassword }); setName(""); setEmail(""); setAccess("DEVELOPER"); router.refresh();
  });
  return (
    <div className="card-pad space-y-3">
      <div className="flex items-center justify-between">
        <div><div className="h-section">Add a user</div><p className="text-sm text-mute">They get a one-time password and choose their own at first sign-in.</p></div>
        {!open && <button className="btn" onClick={() => setOpen(true)}><UserPlus size={15} /> Add user</button>}
      </div>
      {open && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="label" htmlFor="nu-name">Name</label><input id="nu-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><label className="label" htmlFor="nu-email">Email</label><input id="nu-email" type="email" className="input" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><label className="label" htmlFor="nu-access">Role</label><select id="nu-access" className="input" value={access} onChange={(e) => setAccess(e.target.value as typeof access)}><option value="DEVELOPER">Developer</option><option value="LEAD">Lead</option><option value="ADMIN">Admin</option></select></div>
          </div>
          {err && <p role="alert" className="text-sm text-neon-red">{err}</p>}
          <div className="flex gap-2"><button className="btn-primary" disabled={pending || !name.trim() || !email.trim()} onClick={submit}>{pending ? "Creating…" : "Create user"}</button><button className="btn" onClick={() => { setOpen(false); setMade(null); setErr(null); }}>Close</button></div>
        </div>
      )}
      {made && (
        <div className="space-y-2 rounded-lg border border-neon-amber/40 bg-neon-amber/10 p-3">
          <p className="text-sm">Account created for <b>{made.email}</b>. Give them this one-time password. It is shown only now.</p>
          <CopyText label="Temporary password" value={made.pw} />
        </div>
      )}
    </div>
  );
}
