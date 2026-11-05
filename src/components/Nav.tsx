"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, KanbanSquare, Rocket, Timer, Calculator, Video, BarChart3, FileText, CalendarDays, Settings, Users, Shield } from "lucide-react";
import clsx from "clsx";

const groups = [
  { title: "", items: [{ href: "/", label: "Overview", icon: LayoutDashboard }] },
  { title: "Delivery", items: [
    { href: "/board", label: "Board", icon: KanbanSquare },
    { href: "/sprints", label: "Sprints", icon: Rocket },
    { href: "/estimation", label: "Estimates", icon: Calculator },
  ] },
  { title: "Team", items: [
    { href: "/time", label: "Time", icon: Timer },
    { href: "/team", label: "People", icon: Users },
    { href: "/leave", label: "Leave", icon: CalendarDays },
    { href: "/meetings", label: "Meetings", icon: Video },
  ] },
  { title: "Insights", items: [
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/reports", label: "Reports", icon: FileText },
  ] },
];

export function Nav({ isAdmin }: { isAdmin?: boolean }) {
  const path = usePathname();
  const bottom = [{ href: "/settings", label: "Settings", icon: Settings }, ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: Shield }] : [])];
  const all = [...groups, { title: "Workspace", items: bottom }];
  return (
    <nav className="flex flex-col gap-4">
      {all.map((g, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          {g.title && <div className="px-3 pb-1 text-xs font-medium text-mute">{g.title}</div>}
          {g.items.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link key={href} href={href} className={clsx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                active ? "bg-neon/10 text-neon" : "text-mute hover:bg-panel2 hover:text-ink")}>
                <Icon size={17} />{label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
