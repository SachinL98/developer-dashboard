"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const GO: Record<string, [string, string]> = {
  d: ["/my-day", "My day"], o: ["/", "Team overview"], b: ["/board", "Board"], s: ["/sprints", "Sprints"], e: ["/estimation", "Estimates"], t: ["/time", "Time"],
  p: ["/team", "People"], x: ["/decisions", "Decisions"], l: ["/leave", "Leave"], m: ["/meetings", "Meetings"], a: ["/analytics", "Analytics"], q: ["/quality", "Quality"], r: ["/reports", "Reports"],
};

/** Keyboard shortcuts: "g" then a letter to go somewhere, "n" for a new ticket, "?" for this list. Ignored while typing in a field. */
export function Shortcuts() {
  const router = useRouter();
  const [help, setHelp] = useState(false);
  const armed = useRef<number | null>(null);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (/input|textarea|select/i.test(el?.tagName ?? "") || el?.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") { setHelp(false); return; }
      if (e.key === "?") { e.preventDefault(); setHelp((h) => !h); return; }
      if (armed.current && Date.now() - armed.current < 1500) {
        armed.current = null;
        const g = GO[e.key.toLowerCase()];
        if (g) { e.preventDefault(); router.push(g[0]); }
        return;
      }
      if (e.key === "g") armed.current = Date.now();
      else if (e.key === "n") { e.preventDefault(); router.push("/tickets/new"); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [router]);
  if (!help) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onMouseDown={() => setHelp(false)}>
      <div role="dialog" aria-label="Keyboard shortcuts" className="w-full max-w-md rounded-2xl border border-line bg-panel p-5 shadow-2xl fade-in" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Keyboard shortcuts</h2><span className="kbd">esc</span></div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          <div className="col-span-2 mb-1 text-xs font-medium text-mute">Anywhere</div>
          <dt><span className="kbd">⌘K</span> or <span className="kbd">/</span></dt><dd className="text-mute">Jump to a page</dd>
          <dt><span className="kbd">n</span></dt><dd className="text-mute">New ticket</dd>
          <dt><span className="kbd">?</span></dt><dd className="text-mute">This list</dd>
          <div className="col-span-2 mb-1 mt-2 text-xs font-medium text-mute">Go to (press <span className="kbd">g</span>, then)</div>
          {Object.entries(GO).map(([k, [, label]]) => <div key={k} className="contents"><dt><span className="kbd">g</span> <span className="kbd">{k}</span></dt><dd className="text-mute">{label}</dd></div>)}
          <div className="col-span-2 mb-1 mt-2 text-xs font-medium text-mute">On the board</div>
          <dt><span className="kbd">Tab</span></dt><dd className="text-mute">Move between cards</dd>
          <dt><span className="kbd">m</span></dt><dd className="text-mute">Move the card forward</dd>
          <dt><span className="kbd">Enter</span></dt><dd className="text-mute">Open the card</dd>
        </dl>
      </div>
    </div>
  );
}
