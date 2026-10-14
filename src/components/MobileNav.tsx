"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LayoutDashboard, KanbanSquare, Rocket, Timer, Menu, X } from "lucide-react";
import clsx from "clsx";
import { Nav } from "./Nav";

const tabs = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/board", label: "Board", icon: KanbanSquare },
  { href: "/sprints", label: "Sprints", icon: Rocket },
  { href: "/time", label: "Time", icon: Timer },
];

/** Below the `lg` breakpoint: a top bar, a slide-in drawer with the full menu, and a bottom tab bar for the four everyday pages. */
export function MobileNav({ isAdmin, children }: { isAdmin: boolean; children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [open]);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <div className="lg:hidden">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur">
        <button className="btn-ghost -ml-2 h-11 w-11 p-0" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={22} /></button>
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-neon to-neon-violet text-sm font-bold text-bg">S</div>
        <span className="truncate font-semibold">SpaceIT Dev Dashboard</span>
      </header>

      {open && <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />}
      <aside className={clsx("fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[85vw] flex-col gap-4 overflow-y-auto border-r border-line bg-bg p-4 transition-transform duration-200", open ? "translate-x-0" : "-translate-x-full")}
        aria-hidden={!open} role="dialog" aria-label="Menu">
        <div className="flex items-center justify-between">
          <span className="font-semibold">SpaceIT Labs</span>
          <button className="btn-ghost h-11 w-11 p-0" aria-label="Close menu" onClick={() => setOpen(false)}><X size={20} /></button>
        </div>
        <Nav isAdmin={isAdmin} />
        <div className="mt-auto space-y-3">{children}</div>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-bg/92 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="Primary">
        {tabs.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={clsx("flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]", active(href) ? "text-neon" : "text-mute")}>
            <Icon size={20} />{label}
          </Link>))}
        <button onClick={() => setOpen(true)} className="flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-mute"><Menu size={20} />More</button>
      </nav>
    </div>
  );
}
