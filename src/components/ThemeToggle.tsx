"use client";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import clsx from "clsx";
import { setThemeAction } from "@/app/(app)/actions";
import type { ThemeChoice } from "@/lib/theme";

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun }, { value: "system", label: "System", icon: Monitor }, { value: "dark", label: "Dark", icon: Moon },
];

/** Apply a choice to <html> now (the inline script in the root layout does the same before first paint). */
export function applyTheme(t: ThemeChoice) {
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  const el = document.documentElement;
  el.classList.toggle("dark", dark); el.classList.toggle("light", !dark); el.style.colorScheme = dark ? "dark" : "light";
}
const writeCookie = (t: ThemeChoice) => { document.cookie = `theme=${t}; Path=/; Max-Age=31536000; SameSite=Lax`; };
const readCookie = (): ThemeChoice | null => { const m = document.cookie.match(/(?:^|; )theme=(light|dark|system)/); return (m?.[1] as ThemeChoice) ?? null; };

/**
 * Light / System / Dark switch. The choice is kept in a cookie (so the page is themed before it paints) and,
 * when signed in, on the user's profile so it follows them to other browsers. `saved` is the profile value.
 */
export function ThemeToggle({ saved, signedIn = true, compact = false }: { saved?: ThemeChoice; signedIn?: boolean; compact?: boolean }) {
  const [theme, setTheme] = useState<ThemeChoice>(saved ?? "system");
  useEffect(() => {
    // A profile choice made on another device wins over a missing/stale cookie.
    const c = readCookie();
    const t = signedIn && saved ? saved : c ?? "system";
    setTheme(t); writeCookie(t); applyTheme(t);
  }, [saved, signedIn]);
  useEffect(() => {
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme]);
  const choose = (t: ThemeChoice) => { setTheme(t); writeCookie(t); applyTheme(t); if (signedIn) void setThemeAction(t); };
  return (
    <div role="radiogroup" aria-label="Colour theme" className="inline-flex rounded-lg border border-line bg-panel2 p-0.5">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button key={value} role="radio" aria-checked={theme === value} aria-label={`${label} theme`} title={`${label} theme`} onClick={() => choose(value)}
          className={clsx("flex items-center justify-center gap-1.5 rounded-md text-xs transition [@media(pointer:coarse)]:min-h-[40px]", compact ? "h-8 w-9" : "h-8 flex-1 px-2.5", theme === value ? "bg-panel text-ink shadow-sm ring-1 ring-line" : "text-mute hover:text-ink")}>
          <Icon size={14} />{!compact && <span>{label}</span>}
        </button>))}
    </div>
  );
}
