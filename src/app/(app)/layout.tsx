import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Nav } from "@/components/Nav";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { ThemeChoice } from "@/lib/theme";
import { MobileNav } from "@/components/MobileNav";
import { WorkClock } from "@/components/WorkClock";
import { Avatar } from "@/components/ui";
import { logoutAction } from "./actions";
import { LogOut, Plug } from "lucide-react";
import { atLeast } from "@/lib/permissions";
import { getWorkspace, parseHHMM } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  if (me.mustChangePassword) redirect("/change-password");
  const [session, timer, conns, cards, pendingSignups, cfg] = await Promise.all([
    db.workSession.findFirst({ where: { developerId: me.id, endedAt: null } }),
    db.timeEntry.findFirst({ where: { developerId: me.id, endedAt: null }, include: { ticket: true } }),
    db.connection.findMany({ where: { userId: me.id }, select: { provider: true } }),
    db.ticket.findMany({ where: { assigneeId: me.id, status: { in: ["READY_TO_DEV", "IN_PROGRESS", "INITIAL_REVIEW", "REVIEW", "FAILED_STG"] } }, select: { id: true, key: true, title: true }, orderBy: { rank: "asc" } }),
    atLeast(me.access, "ADMIN") ? db.signupRequest.count() : Promise.resolve(0),
    getWorkspace(), // also applies the admin-set timezone
  ]);
  const [sh, sm] = parseHHMM(cfg.workStart), [eh, em] = parseHHMM(cfg.workEnd);
  const targetHrs = Math.round(((eh * 60 + em - (sh * 60 + sm)) / 60) * 10) / 10;
  const has = new Set(conns.map((c) => c.provider));
  const missing = !atLeast(me.access, "ADMIN") ? [] : [!has.has("JIRA") && "Jira", !has.has("GOOGLE") && "Google Calendar & Meet"].filter(Boolean) as string[];
  const footer = (
    <>
          <WorkClock cards={cards} planned={session?.planTicketIds ?? []} targetHrs={targetHrs} sessionStart={session?.startedAt.toISOString() ?? null} timer={timer ? { key: timer.ticket.key, title: timer.ticket.title, startedAt: timer.startedAt.toISOString() } : null} />
          <ThemeToggle saved={me.theme as ThemeChoice} />
          <div className="flex items-center gap-2 rounded-lg border border-line p-2">
            <Avatar name={me.name} hue={me.avatarHue} />
            <div className="min-w-0 flex-1"><div className="truncate text-sm">{me.name}</div><div className="text-[10px] text-mute">{me.access.toLowerCase()}</div></div>
            <form action={logoutAction}><button className="btn-ghost p-1.5" title="Sign out" aria-label="Sign out"><LogOut size={15} /></button></form>
          </div>
    </>
  );
  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      <MobileNav isAdmin={atLeast(me.access, "ADMIN")}>{footer}</MobileNav>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-panel p-4 lg:flex">
        <div className="flex items-center gap-3 px-1 pt-1">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-neon font-bold text-on-accent">S</div>
          <div><div className="text-sm font-semibold leading-tight">SpaceIT Labs</div><div className="text-xs text-mute">Delivery dashboard</div></div>
        </div>
        <Link href="/tickets/new" className="btn-primary w-full">+ New ticket</Link>
        <Nav isAdmin={atLeast(me.access, "ADMIN")} />
        <div className="mt-auto space-y-3">{footer}</div>
      </aside>
      <main className="min-w-0 flex-1 p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 2xl:px-12">
        {pendingSignups > 0 && (
          <Link href="/admin/users" className="mb-4 flex items-center gap-3 rounded-lg border border-neon-amber/40 bg-neon-amber/10 px-4 py-2.5 text-sm hover:border-neon-amber">
            {pendingSignups} {pendingSignups === 1 ? "person is" : "people are"} waiting for account approval. <span className="ml-auto text-neon-amber">Review →</span>
          </Link>
        )}
        {missing.length > 0 && (
          <Link href="/settings" className="mb-6 flex items-center gap-3 rounded-lg border border-neon/25 bg-neon/5 px-4 py-2.5 text-sm hover:border-neon/50">
            <Plug size={16} className="text-neon" /> Connect {missing.join(" and ")} to keep tickets and meetings in sync. <span className="ml-auto text-neon">Connect →</span>
          </Link>
        )}
        {children}
      </main>
    </div>
  );
}
