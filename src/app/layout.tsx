import type { Metadata } from "next";
import "./globals.css";
import { db } from "@/lib/db";
import { currentDeveloper } from "@/lib/session";
import { Nav } from "@/components/Nav";
import { WorkClock } from "@/components/WorkClock";
import { DevSwitcher } from "@/components/DevSwitcher";
import { Avatar } from "@/components/ui";

export const metadata: Metadata = { title: "SpaceIT Dev Dashboard", description: "Sprint, time, estimation and analytics hub for SpaceIT Labs developers" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await currentDeveloper();
  const devs = await db.developer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const [session, timer] = me
    ? await Promise.all([
        db.workSession.findFirst({ where: { developerId: me.id, endedAt: null } }),
        db.timeEntry.findFirst({ where: { developerId: me.id, endedAt: null }, include: { ticket: true } }),
      ])
    : [null, null];
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen font-sans antialiased">
        <div className="mx-auto flex max-w-[1600px]">
          <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-5 border-r border-line bg-bg/60 p-4 backdrop-blur md:flex">
            <div className="flex items-center gap-3 px-1 pt-1">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-neon to-neon-violet font-bold text-bg shadow-glow">S</div>
              <div><div className="text-sm font-semibold leading-tight">SpaceIT Labs</div><div className="font-mono text-[11px] text-mute">dev.dashboard</div></div>
            </div>
            <Nav />
            <div className="mt-auto space-y-3">
              {me && <WorkClock sessionStart={session?.startedAt.toISOString() ?? null} timer={timer ? { key: timer.ticket.key, title: timer.ticket.title, startedAt: timer.startedAt.toISOString() } : null} />}
              {me && (
                <div className="flex items-center gap-2">
                  <Avatar name={me.name} hue={me.avatarHue} />
                  <div className="min-w-0 flex-1"><DevSwitcher devs={devs} current={me.id} /></div>
                </div>
              )}
            </div>
          </aside>
          <main className="min-w-0 flex-1 p-4 md:p-8">
            <MobileBar />
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

function MobileBar() {
  return <div className="mb-4 flex items-center justify-between md:hidden"><span className="font-semibold">SpaceIT Dev Dashboard</span><a className="btn" href="/board">Board</a></div>;
}
