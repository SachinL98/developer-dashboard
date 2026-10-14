import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth/session";
import { allowedDomain } from "@/lib/permissions";
import { authMode } from "@/lib/integrations/status";
import { safeNext } from "@/lib/auth/oauth";
import { demoLoginAction } from "./actions";
import { Avatar } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = { not_configured: "Google sign-in isn't configured on this server yet. Ask an admin to set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  if (await currentUser()) redirect(safeNext(sp.next));
  const mode = authMode();
  const demoUsers = mode === "demo" ? await db.developer.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : [];
  const error = sp.error ? ERRORS[sp.error] ?? sp.error : null;
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="fixed right-4 top-4"><ThemeToggle signedIn={false} compact /></div>
      <div className="card-pad w-full max-w-md space-y-6 shadow-glow">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-neon to-neon-violet text-lg font-bold text-bg">S</div>
          <div><h1 className="text-xl font-semibold leading-tight">SpaceIT Dev Dashboard</h1><p className="text-sm text-mute">Sign in with your office account</p></div>
        </div>
        {error && <div role="alert" className="rounded-lg border border-neon-red/40 bg-neon-red/10 px-3 py-2 text-sm text-neon-red">{error}</div>}

        {mode === "google" && (
          <a href={`/api/auth/google/login${sp.next ? `?next=${encodeURIComponent(safeNext(sp.next))}` : ""}`} className="btn-primary w-full py-2.5">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="currentColor" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.8 1.1 8 2.9l6.4-6.4C34.5 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" /></svg>
            Sign in with Google (@{allowedDomain()})
          </a>
        )}
        {mode === "unconfigured" && <p className="text-sm text-mute">Google sign-in isn&apos;t configured on this server. An admin needs to set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code>.</p>}

        {mode === "demo" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-neon-amber/40 bg-neon-amber/10 px-3 py-2 text-xs text-neon-amber">Demo mode: Google sign-in isn&apos;t configured, so you can pick a seeded user. This is disabled in production unless DEMO_MODE=true.</div>
            <div className="space-y-1.5">
              {demoUsers.map((u) => (
                <form key={u.id} action={demoLoginAction.bind(null, u.id, safeNext(sp.next))}>
                  <button className="flex w-full items-center gap-3 rounded-lg border border-line bg-panel2 px-3 py-2 text-left text-sm transition hover:border-neon/50">
                    <Avatar name={u.name} hue={u.avatarHue} size={28} /><span className="flex-1">{u.name}</span><span className="text-[10px] uppercase tracking-wider text-mute">{u.access.toLowerCase()}</span>
                  </button>
                </form>
              ))}
            </div>
          </div>
        )}
        <p className="text-center text-xs text-mute">Only @{allowedDomain()} accounts can sign in.</p>
      </div>
    </main>
  );
}
