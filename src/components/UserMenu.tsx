"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, Settings } from "lucide-react";
import { Avatar } from "./ui";
import { ThemeToggle } from "./ThemeToggle";
import type { ThemeChoice } from "@/lib/theme";

/** Avatar button in the top bar: opens a small menu with the person, theme, settings and sign out. */
export function UserMenu({ name, role, hue, theme, logout }: { name: string; role: string; hue: number; theme: ThemeChoice; logout: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" className="flex items-center gap-2 rounded-full p-0.5 transition hover:bg-panel2">
        <Avatar name={name} hue={hue} size={32} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-50 w-72 rounded-2xl border border-line bg-panel p-2 shadow-2xl fade-in">
          <div className="flex items-center gap-3 px-3 py-3"><Avatar name={name} hue={hue} size={36} /><div className="min-w-0"><div className="truncate text-sm font-semibold">{name}</div><div className="text-xs capitalize text-mute">{role}</div></div></div>
          <div className="border-t border-line px-3 py-3"><div className="eyebrow mb-2">Theme</div><ThemeToggle saved={theme} /></div>
          <div className="border-t border-line pt-1">
            <Link href="/settings" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-panel2"><Settings size={15} className="text-mute" />Settings</Link>
            <form action={logout}><button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-panel2"><LogOut size={15} className="text-mute" />Sign out</button></form>
          </div>
        </div>)}
    </div>
  );
}
