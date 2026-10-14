import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Nav } from "@/components/Nav";
import { MobileNav } from "@/components/MobileNav";
import { WorkClock } from "@/components/WorkClock";
import { Avatar } from "@/components/ui";
import { logoutAction } from "./actions";
import { LogOut, Plug } from "lucide-react";
import { atLeast } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  const [session, timer, conns] = await Promise.all([
    db.workSession.findFirst({ where: { developerId: me.id, endedAt: null } }),
    db.timeEntry.findFirst({ where: { developerId: me.id, endedAt: null }, include: { ticket: true } }),
    db.connection.findMany({ where: { userId: me.id }, select: { provider: true } }),
  ]);
  const has = new Set(conns.map((c) => c.provider));
  const missing = [!has.has("JIRA") && "Jira", !has.has("GOOGLE") && "Google Calendar & Meet"].filter(Boolean) as string[];
  const footer = (
    <>
          <WorkClock sessionStart={session?.startedAt.toISOString() ?? null} timer={timer ? { key: timer.ticket.key, title: timer.ticket.title, startedAt: timer.startedAt.toISOString() } : null} />
          <div className="flex items-center gap-2 rounded-xl border border-line bg-panel/60 p-2">
            <Avatar name={me.name} hue={me.avatarHue} />
            <div className="min-w-0 flex-1"><div className="truncate text-sm">{me.name}</div><div className="text-[10px] uppercase tracking-wider text-mute">{me.access.toLowerCase()}</div></div>
            <form action={logoutAction}><button className="btn-ghost p-1.5" title="Sign out" aria-label="Sign out"><LogOut size={15} /></button></form>
          </div>
    </>
  );
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col lg:flex-row">
      <MobileNav isAdmin={atLeast(me.access, "ADMIN")}>{footer}</MobileNav>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-bg/60 p-4 backdrop-blur lg:flex">
        <div className="flex items-center gap-3 px-1 pt-1">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-neon to-neon-violet font-bold text-bg shadow-glow">S</div>
          <div><div className="text-sm font-semibold leading-tight">SpaceIT Labs</div><div className="font-mono text-[11px] text-mute">dev.dashboard</div></div>
        </div>
        <Nav isAdmin={atLeast(me.access, "ADMIN")} />
        <div className="mt-auto space-y-3">{footer}</div>
      </aside>
      <main className="min-w-0 flex-1 p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8">
        {missing.length > 0 && (
          <Link href="/settings" className="mb-6 flex items-center gap-3 rounded-xl border border-neon/30 bg-neon/10 px-4 py-2.5 text-sm hover:border-neon/60">
            <Plug size={16} className="text-neon" /> Connect {missing.join(" and ")} to sync tickets, sprints and meetings as you. <span className="ml-auto text-neon">Set up →</span>
          </Link>
        )}
        {children}
      </main>
    </div>
  );
}
