"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { markInboxReadAction } from "@/app/(app)/actions";

export interface BellItem { id: string; title: string; body: string | null; href: string | null; at: string; read: boolean }

const ago = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 60 ? `${m || 1}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };

/** The bell in the top bar: unread count, a list of recent messages, mark as read. */
export function NotificationBell({ items }: { items: BellItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((i) => !i.read).length;
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, []);
  const read = (id: string) => start(async () => { await markInboxReadAction(id); router.refresh(); });
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} className="btn-ghost relative h-9 w-9 p-0">
        <Bell size={17} />
        {unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-neon px-1 text-[10px] font-semibold text-on-accent">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-50 w-80 rounded-2xl border border-line bg-panel shadow-2xl fade-in">
          <div className="flex items-center justify-between border-b border-line px-4 py-3"><span className="text-sm font-semibold">Notifications</span>{unread > 0 && <button className="text-xs font-medium text-neon hover:underline" onClick={() => read("all")}>Mark all read</button>}</div>
          <ul className="max-h-96 overflow-y-auto p-1.5">
            {items.map((i) => {
              const inner = <><div className="flex items-start gap-2">{!i.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-neon" />}<div className="min-w-0"><div className="text-sm font-medium">{i.title}</div>{i.body && <div className="text-xs text-mute">{i.body}</div>}<div className="mt-0.5 text-[11px] text-mute">{ago(i.at)}</div></div></div></>;
              return <li key={i.id}>{i.href ? <Link href={i.href} onClick={() => { setOpen(false); if (!i.read) read(i.id); }} className="block rounded-lg px-3 py-2 hover:bg-panel2">{inner}</Link> : <button className="block w-full rounded-lg px-3 py-2 text-left hover:bg-panel2" onClick={() => !i.read && read(i.id)}>{inner}</button>}</li>;
            })}
            {!items.length && <li className="px-3 py-8 text-center text-sm text-mute">You're all caught up.</li>}
          </ul>
        </div>)}
    </div>
  );
}
