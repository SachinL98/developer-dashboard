import clsx from "clsx";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { fg, tint } from "@/lib/theme";
import { STATUS_META, TYPE_META, PRIORITY_META, type StatusKey } from "@/lib/workflow";

export function PageHeader({ title, sub, actions, back }: { title: string; sub?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        {back && <Link href={back.href} className="mb-1.5 inline-flex items-center gap-0.5 text-xs font-medium text-mute hover:text-ink"><ChevronLeft size={14} />{back.label}</Link>}
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[26px] sm:leading-8">{title}</h1>
        {sub && <p className="mt-1 max-w-3xl text-sm text-mute">{sub}</p>}
      </div>
      <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

export function Kpi({ label, value, sub, accent = "#2563eb", spark }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string; spark?: number[] }) {
  const max = Math.max(1, ...(spark ?? [1]));
  return (
    <div className="card-pad">
      <div className="text-xs font-medium text-mute">{label}</div>
      <div className="mt-2 text-[28px] font-semibold leading-none tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-2 text-xs text-mute">{sub}</div>}
      {spark && (
        <div className="mt-3 flex h-8 items-end gap-[3px]">
          {spark.map((v, i) => <div key={i} className="w-full rounded-sm" style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: fg(accent), opacity: 0.35 + (i / spark.length) * 0.65 }} />)}
        </div>
      )}
    </div>
  );
}

export const StatusBadge = ({ status }: { status: string }) => {
  const m = STATUS_META[status as StatusKey];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium" style={{ color: fg(m.color), background: tint(m.color, 12) }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />{m.label}
    </span>
  );
};
export const TypeDot = ({ type }: { type: string }) => {
  const m = TYPE_META[type as keyof typeof TYPE_META];
  return <span className="inline-flex items-center gap-1 text-xs text-mute"><span className="h-2 w-2 rounded-sm" style={{ background: m.color }} />{m.label}</span>;
};
export const PriorityTag = ({ p }: { p: string }) => {
  const m = PRIORITY_META[p as keyof typeof PRIORITY_META];
  return <span className="text-xs font-medium" style={{ color: fg(m.color) }}>▲ {m.label}</span>;
};

export function Avatar({ name, hue, size = 28, id, ver }: { name: string; hue: number; size?: number; id?: string; ver?: number }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  if (id && ver && ver > 0) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/avatar/${id}?v=${ver}`} alt={name} title={name} width={size} height={size} loading="lazy" className="inline-block shrink-0 rounded-full object-cover ring-2 ring-panel" style={{ width: size, height: size }} />;
  }
  return (
    <span title={name} className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-[#07090f] ring-2 ring-panel"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, hsl(${hue} 85% 70%), hsl(${(hue + 50) % 360} 80% 62%))` }}>{initials}</span>
  );
}

export function Progress({ pct, color = "#2563eb", className }: { pct: number; color?: string; className?: string }) {
  return (
    <div className={clsx("h-1.5 w-full overflow-hidden rounded-full bg-line", className)}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

export const Empty = ({ children, icon, action }: { children: ReactNode; icon?: ReactNode; action?: ReactNode }) => (
  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-panel2/30 p-8 text-center text-sm text-mute">
    {icon && <span className="grid h-10 w-10 place-items-center rounded-full bg-panel2 text-mute">{icon}</span>}
    <div className="max-w-md">{children}</div>
    {action && <div className="mt-1">{action}</div>}
  </div>
);
