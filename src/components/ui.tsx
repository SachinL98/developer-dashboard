import clsx from "clsx";
import type { ReactNode } from "react";
import { STATUS_META, TYPE_META, PRIORITY_META, type StatusKey } from "@/lib/workflow";

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-mute">{sub}</p>}
      </div>
      <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

export function Kpi({ label, value, sub, accent = "#6ee7ff", spark }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string; spark?: number[] }) {
  const max = Math.max(1, ...(spark ?? [1]));
  return (
    <div className="card-pad relative overflow-hidden fade-in">
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-2xl" style={{ background: accent }} />
      <div className="h-section">{label}</div>
      <div className="mt-2 font-mono text-3xl font-medium tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-mute">{sub}</div>}
      {spark && (
        <div className="mt-3 flex h-8 items-end gap-[3px]">
          {spark.map((v, i) => <div key={i} className="w-full rounded-sm" style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: accent, opacity: 0.35 + (i / spark.length) * 0.65 }} />)}
        </div>
      )}
    </div>
  );
}

export const StatusBadge = ({ status }: { status: string }) => {
  const m = STATUS_META[status as StatusKey];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium" style={{ borderColor: m.color + "55", color: m.color, background: m.color + "14" }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />{m.label}
    </span>
  );
};
export const TypeDot = ({ type }: { type: string }) => {
  const m = TYPE_META[type as keyof typeof TYPE_META];
  return <span className="inline-flex items-center gap-1 text-[11px] text-mute"><span className="h-2 w-2 rounded-sm" style={{ background: m.color }} />{m.label}</span>;
};
export const PriorityTag = ({ p }: { p: string }) => {
  const m = PRIORITY_META[p as keyof typeof PRIORITY_META];
  return <span className="text-[11px] font-medium" style={{ color: m.color }}>▲ {m.label}</span>;
};

export function Avatar({ name, hue, size = 28 }: { name: string; hue: number; size?: number }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  return (
    <span title={name} className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-[#07090f]"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, hsl(${hue} 85% 70%), hsl(${(hue + 50) % 360} 80% 62%))` }}>{initials}</span>
  );
}

export function Progress({ pct, color = "#6ee7ff", className }: { pct: number; color?: string; className?: string }) {
  return (
    <div className={clsx("h-1.5 w-full overflow-hidden rounded-full bg-line", className)}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: `linear-gradient(90deg, ${color}, ${color}cc)` }} />
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-mute">{children}</div>;
