"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Search, CornerDownLeft } from "lucide-react";

export interface PaletteItem { href: string; label: string; hint?: string }

/** Quick jump anywhere: press ⌘K / Ctrl+K (or "/") on any page, type a few letters, press Enter. */
export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? items.filter((x) => (x.label + " " + (x.hint ?? "")).toLowerCase().includes(t)) : items;
  }, [q, items]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? "") || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) { e.preventDefault(); setOpen(true); }
      else if (e.key === "Escape") setOpen(false);
    };
    const openEv = () => setOpen(true);
    window.addEventListener("keydown", on); window.addEventListener("open-palette", openEv);
    return () => { window.removeEventListener("keydown", on); window.removeEventListener("open-palette", openEv); };
  }, []);
  useEffect(() => { if (open) { setQ(""); setI(0); setTimeout(() => input.current?.focus(), 0); } }, [open]);
  useEffect(() => setI(0), [q]);
  if (!open) return null;
  const go = (href: string) => { setOpen(false); router.push(href); };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-start justify-items-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
      <div role="dialog" aria-label="Jump to" className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl fade-in" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={16} className="text-mute" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to a page or action…" aria-label="Search pages"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setI((n) => Math.min(n + 1, list.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setI((n) => Math.max(n - 1, 0)); }
              else if (e.key === "Enter" && list[i]) go(list[i].href);
            }}
            className="h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-mute/70" />
          <span className="kbd">esc</span>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {list.map((x, n) => (
            <li key={x.href} role="option" aria-selected={n === i}>
              <button onMouseEnter={() => setI(n)} onClick={() => go(x.href)} className={clsx("flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm", n === i ? "bg-neon/10 text-neon" : "text-ink")}>
                <span>{x.label}{x.hint && <span className="ml-2 text-xs text-mute">{x.hint}</span>}</span>
                {n === i && <CornerDownLeft size={13} />}
              </button>
            </li>))}
          {!list.length && <li className="px-3 py-6 text-center text-sm text-mute">Nothing matches “{q}”.</li>}
        </ul>
      </div>
    </div>
  );
}

export function PaletteButton({ className }: { className?: string }) {
  return (
    <button onClick={() => window.dispatchEvent(new Event("open-palette"))} className={clsx("flex w-full items-center gap-2 rounded-lg border border-line bg-panel2/60 px-3 py-2 text-sm text-mute transition hover:border-mute/40 hover:text-ink", className)} aria-label="Jump to a page (Command K)">
      <Search size={15} /><span className="flex-1 text-left">Jump to…</span><span className="kbd">⌘K</span>
    </button>
  );
}
