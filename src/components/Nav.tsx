"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, KanbanSquare, Rocket, Timer, Calculator, Video, BarChart3, PlusCircle, Plug, Users, Shield } from "lucide-react";
import clsx from "clsx";

const items = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/board", label: "Board", icon: KanbanSquare },
  { href: "/sprints", label: "Sprints", icon: Rocket },
  { href: "/time", label: "Time & Progress", icon: Timer },
  { href: "/estimation", label: "Estimation", icon: Calculator },
  { href: "/meetings", label: "Meetings", icon: Video },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/team", label: "Team", icon: Users },
  { href: "/tickets/new", label: "New ticket", icon: PlusCircle },
  { href: "/settings", label: "Integrations", icon: Plug },
];

export function Nav({ isAdmin }: { isAdmin?: boolean }) {
  const path = usePathname();
  const list = isAdmin ? [...items, { href: "/admin", label: "Admin", icon: Shield }] : items;
  return (
    <nav className="flex flex-col gap-1">
      {list.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link key={href} href={href} className={clsx("group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
            active ? "bg-gradient-to-r from-neon/15 to-transparent text-ink shadow-[inset_2px_0_0_rgb(var(--neon))]" : "text-mute hover:bg-panel2 hover:text-ink")}>
            <Icon size={17} className={active ? "text-neon" : "group-hover:text-neon"} />{label}
          </Link>
        );
      })}
    </nav>
  );
}
