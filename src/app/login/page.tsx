import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/oauth";
import { demoLoginAction } from "./actions";
import { LoginForm } from "./LoginForm";
import { Avatar } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  if (await currentUser()) redirect(safeNext(sp.next));
  const demoUsers = process.env.NODE_ENV !== "production" ? await db.developer.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : [];
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="fixed right-4 top-4"><ThemeToggle signedIn={false} compact /></div>
      <div className="card-pad w-full max-w-md space-y-6">
        <div className="flex items-center gap-3">
          <img src="/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 rounded-xl" />
          <div><h1 className="text-xl font-semibold leading-tight">Dev Dashboard</h1><p className="text-sm text-mute">Sign in to continue</p></div>
        </div>
        {sp.error === "session" && <div role="alert" className="rounded-lg border border-neon-amber/40 bg-neon-amber/10 px-3 py-2 text-sm text-neon-amber">Your session ended. Sign in again.</div>}
        <LoginForm next={safeNext(sp.next)} />
        {demoUsers.length > 0 && (
          <div className="space-y-2 border-t border-line pt-4">
            <div className="text-xs text-mute">Development only: sign in as a seeded user without a password.</div>
            <div className="space-y-1.5">
              {demoUsers.map((u) => (
                <form key={u.id} action={demoLoginAction.bind(null, u.id, safeNext(sp.next))}>
                  <button className="flex w-full items-center gap-3 rounded-lg border border-line bg-panel2 px-3 py-2 text-left text-sm transition hover:border-neon/50">
                    <Avatar name={u.name} hue={u.avatarHue} size={28} /><span className="flex-1">{u.name}</span><span className="text-xs text-mute">{u.access.toLowerCase()}</span>
                  </button>
                </form>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
