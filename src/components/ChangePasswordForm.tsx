"use client";
import { useActionState } from "react";
import { changePasswordAction, type PasswordState } from "@/app/account-actions";

export function ChangePasswordForm({ forced = false }: { forced?: boolean }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePasswordAction, { error: null });
  return (
    <form action={action} className="space-y-3">
      {forced && <input type="hidden" name="redirect" value="1" />}
      {state.error && <div role="alert" className="rounded-lg border border-neon-red/40 bg-neon-red/10 px-3 py-2 text-sm text-neon-red">{state.error}</div>}
      {state.done && <div className="rounded-lg border border-neon-lime/40 bg-neon-lime/10 px-3 py-2 text-sm text-neon-lime">Password changed. Other devices were signed out.</div>}
      <div><label className="label" htmlFor="current">{forced ? "Temporary password" : "Current password"}</label><input id="current" name="current" type="password" autoComplete="current-password" required className="input" /></div>
      <div><label className="label" htmlFor="next">New password</label><input id="next" name="next" type="password" autoComplete="new-password" required minLength={12} className="input" /></div>
      <div><label className="label" htmlFor="confirm">Confirm new password</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={12} className="input" /></div>
      <p className="text-xs text-mute">At least 12 characters, with a letter and a number. Don&apos;t use your name or email.</p>
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Change password"}</button>
    </form>
  );
}
