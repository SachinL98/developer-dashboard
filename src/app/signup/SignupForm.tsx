"use client";
import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { signupAction, type SignupState } from "./actions";

export function SignupForm() {
  const [state, action, pending] = useActionState<SignupState, FormData>(signupAction, { error: null });
  if (state.done) return (
    <div className="space-y-4 text-center">
      <CheckCircle2 className="mx-auto text-neon-lime" size={36} />
      <p className="text-sm">{state.done}</p>
      <Link href="/login" className="btn w-full">Back to sign in</Link>
    </div>
  );
  return (
    <form action={action} className="space-y-3">
      {state.error && <div role="alert" className="rounded-lg border border-neon-red/40 bg-neon-red/10 px-3 py-2 text-sm text-neon-red">{state.error}</div>}
      <div><label className="label" htmlFor="name">Full name</label><input id="name" name="name" required autoComplete="name" className="input" /></div>
      <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="username" className="input" placeholder="you@company.com" /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="jobTitle">Job title</label><input id="jobTitle" name="jobTitle" autoComplete="organization-title" className="input" placeholder="Developer" /></div>
        <div><label className="label" htmlFor="githubLogin">GitHub username <span className="font-normal">(optional)</span></label><input id="githubLogin" name="githubLogin" className="input" /></div>
      </div>
      <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" className="input" /></div>
      <div><label className="label" htmlFor="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" required minLength={12} autoComplete="new-password" className="input" /></div>
      <p className="text-xs text-mute">At least 12 characters, with a letter and a number. An admin approves each request.</p>
      <button className="btn-primary w-full py-2.5" disabled={pending}>{pending ? "Sending…" : "Request access"}</button>
      <p className="text-center text-xs text-mute">Already approved? <Link href="/login" className="text-neon">Sign in</Link></p>
    </form>
  );
}
