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
import { UserMenu } from "@/components/UserMenu";
import { CommandPalette, PaletteButton, type PaletteItem } from "@/components/CommandPalette";
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
  const jump: PaletteItem[] = [
    { href: "/tickets/new", label: "New ticket", hint: "Create" }, { href: "/", label: "Overview" }, { href: "/board", label: "Board", hint: "Kanban" }, { href: "/sprints", label: "Sprints" },
    { href: "/estimation", label: "Estimates", hint: "Planning poker" }, { href: "/time", label: "Time", hint: "Timer, check-ins" }, { href: "/team", label: "People" },
    { href: "/reports?kind=oneonone", label: "1:1 report", hint: "Reports" }, { href: "/leave", label: "Leave" }, { href: "/meetings", label: "Meetings", hint: "Notes, recorder" },
    { href: "/analytics", label: "Analytics" }, { href: "/reports", label: "Reports" }, { href: "/settings", label: "Settings", hint: "Profile, AI, alerts" },
    ...(atLeast(me.access, "ADMIN") ? [{ href: "/admin", label: "Admin", hint: "Users, integrations" }, { href: "/admin/notifications", label: "Alerts", hint: "Email, Discord" }] : []),
  ];
  const footer = (
    <>
          <WorkClock cards={cards} planned={session?.planTicketIds ?? []} targetHrs={targetHrs} sessionStart={session?.startedAt.toISOString() ?? null} timer={timer ? { key: timer.ticket.key, title: timer.ticket.title, startedAt: timer.startedAt.toISOString() } : null} />
          <ThemeToggle saved={me.theme as ThemeChoice} />
          <div className="flex items-center gap-2 rounded-lg border border-line p-2">
            <Avatar name={me.name} hue={me.avatarHue} id={me.id} ver={me.avatarVer} />
            <div className="min-w-0 flex-1"><div className="truncate text-sm">{me.name}</div><div className="text-[10px] text-mute">{me.access.toLowerCase()}</div></div>
            <form action={logoutAction}><button className="btn-ghost p-1.5" title="Sign out" aria-label="Sign out"><LogOut size={15} /></button></form>
          </div>
    </>
  );
  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      <a href="#main" className="skip-link">Skip to content</a>
      <CommandPalette items={jump} />
      <MobileNav isAdmin={atLeast(me.access, "ADMIN")}>{footer}</MobileNav>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-line/70 bg-bg px-3 py-4 lg:flex">
        <Link href="/" className="flex items-center gap-2.5 px-2">
          <img src="/icon-192.png" alt="" width={32} height={32} className="h-8 w-8 rounded-lg" />
          <div className="text-sm font-semibold tracking-tight">Dev Dashboard</div>
        </Link>
        <Nav isAdmin={atLeast(me.access, "ADMIN")} />
        <div className="mt-auto"><WorkClock cards={cards} planned={session?.planTicketIds ?? []} targetHrs={targetHrs} sessionStart={session?.startedAt.toISOString() ?? null} timer={timer ? { key: timer.ticket.key, title: timer.ticket.title, startedAt: timer.startedAt.toISOString() } : null} /></div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 hidden h-14 items-center gap-3 border-b border-line/70 bg-bg/85 px-8 backdrop-blur lg:flex 2xl:px-12">
          <div className="max-w-md flex-1"><PaletteButton className="h-9 bg-panel" /></div>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/tickets/new" className="btn-primary">+ New ticket</Link>
            <UserMenu id={me.id} ver={me.avatarVer} name={me.name} role={me.access.toLowerCase()} hue={me.avatarHue} theme={me.theme as ThemeChoice} logout={logoutAction} />
          </div>
        </header>
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 p-4 pb-24 sm:p-6 sm:pb-24 lg:px-8 lg:py-8 2xl:px-12">
        {pendingSignups > 0 && (
          <Link href="/admin/users" className="mb-4 flex items-center gap-3 rounded-lg border border-neon-amber/40 bg-neon-amber/10 px-4 py-2.5 text-sm hover:border-neon-amber">
            {pendingSignups} {pendingSignups === 1 ? "person is" : "people are"} waiting for account approval. <span className="ml-auto text-neon-amber">Review →</span>
          </Link>
        )}
        {missing.length > 0 && (
          <Link href="/settings" className="mb-5 flex items-center gap-2 text-xs text-mute hover:text-ink">
            <Plug size={13} className="text-neon" /> Connect {missing.join(" and ")} to keep tickets and meetings in sync. <span className="font-medium text-neon">Connect →</span>
          </Link>
        )}
        {children}
      </main>
      </div>
    </div>
  );
}
