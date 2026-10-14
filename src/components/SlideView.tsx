import clsx from "clsx";
import type { Slide } from "@/lib/report";

const toneCls = { good: "text-neon-lime", bad: "text-neon-red", neutral: "text-ink" } as const;

/** One 16:9 slide. All sizes are in container-query units, so it scales from a thumbnail to a projector. */
export function SlideView({ slide, index, total, className }: { slide: Slide; index?: number; total?: number; className?: string }) {
  const s = slide;
  return (
    <div className={clsx("relative aspect-video w-full overflow-hidden rounded-[1.2cqw] border border-line bg-panel text-ink", className)} style={{ containerType: "inline-size" }}>
      {s.layout === "title" ? (
        <div className="flex h-full flex-col justify-center px-[7cqw]">
          <div className="absolute inset-y-0 left-0 w-[1.4cqw] bg-gradient-to-b from-neon to-neon-violet" />
          <div className="text-[4.4cqw] font-bold leading-tight">{s.title}</div>
          <div className="mt-[1.6cqw] text-[2cqw] text-neon">{s.subtitle}</div>
          <div className="mt-[3cqw] space-y-[0.4cqw] text-[1.5cqw] text-mute">{s.meta.map((m) => <div key={m}>{m}</div>)}</div>
        </div>
      ) : (
        <div className="flex h-full flex-col px-[4cqw] pb-[2.5cqw] pt-[3cqw]">
          <div className="text-[3cqw] font-bold leading-tight">{s.title}</div>
          <div className="mb-[2cqw] mt-[0.8cqw] h-[0.4cqw] w-[7cqw] rounded bg-neon" />
          <div className="min-h-0 flex-1">
            {s.layout === "kpis" && (
              <div>
                <div className="grid gap-[1.4cqw]" style={{ gridTemplateColumns: `repeat(${s.kpis.length}, minmax(0, 1fr))` }}>
                  {s.kpis.map((k) => (
                    <div key={k.label} className="rounded-[1cqw] border border-line bg-panel2 p-[1.4cqw]">
                      <div className="text-[1.1cqw] font-semibold uppercase tracking-wider text-mute">{k.label}</div>
                      <div className={clsx("mt-[0.6cqw] font-mono text-[3.4cqw] font-bold leading-none", toneCls[k.tone ?? "neutral"])}>{k.value}</div>
                      {k.sub && <div className="mt-[0.8cqw] text-[1.15cqw] text-mute">{k.sub}</div>}
                    </div>))}
                </div>
                <ul className="mt-[2.4cqw] space-y-[1cqw] text-[1.8cqw]">{s.bullets.map((b) => <li key={b} className="flex gap-[1cqw]"><span className="text-neon">•</span><span>{b}</span></li>)}</ul>
              </div>
            )}
            {s.layout === "bullets" && <ul className="space-y-[1.6cqw] text-[2.3cqw]">{s.bullets.map((b) => <li key={b} className="flex gap-[1.2cqw]"><span className="text-neon">•</span><span>{b}</span></li>)}</ul>}
            {s.layout === "table" && (
              <div>
                {s.rows.length > 0 && (
                  <table className="w-full table-fixed text-left text-[1.45cqw]">
                    <thead><tr className="bg-panel2 text-[1.1cqw] uppercase tracking-wider text-mute">{s.columns.map((c, ci) => <th key={c} className={clsx("px-[1cqw] py-[0.8cqw] font-semibold", ci === (s.columns.indexOf("Title") >= 0 ? s.columns.indexOf("Title") : s.columns.length >= 4 ? 0 : -1) && "w-[40%]")}>{c}</th>)}</tr></thead>
                    <tbody>{s.rows.map((r, i) => <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className={clsx("truncate px-[1cqw] py-[0.7cqw]", j === 0 && "font-mono text-mute")}>{c}</td>)}</tr>)}</tbody>
                  </table>)}
                {s.caption && <p className="mt-[1.2cqw] text-[1.3cqw] italic text-mute">{s.caption}</p>}
              </div>
            )}
            {s.layout === "chart" && <BarChart labels={s.labels} series={s.series} unit={s.unit} caption={s.caption} />}
          </div>
          {s.note && <div className="mt-[1cqw] rounded-[0.8cqw] border border-neon/40 bg-neon/10 px-[1.6cqw] py-[1cqw] text-[1.5cqw] italic">{s.note}</div>}
        </div>
      )}
      {index != null && total != null && s.layout !== "title" && <div className="absolute bottom-[1cqw] right-[1.6cqw] font-mono text-[1.1cqw] text-mute">{index + 1} / {total}</div>}
    </div>
  );
}

const SERIES = ["rgb(var(--neon))", "rgb(var(--neon-violet))"];

function BarChart({ labels, series, unit, caption }: { labels: string[]; series: { name: string; values: number[] }[]; unit: string; caption?: string }) {
  const max = Math.max(1, ...series.flatMap((x) => x.values));
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 items-end gap-[1cqw] border-b border-line pb-[0.4cqw]" style={{ minHeight: "20cqw", maxHeight: "30cqw" }}>
        {labels.map((l, g) => (
          <div key={l + g} className="flex h-full min-w-0 flex-1 items-end justify-center gap-[0.3cqw]">
            {series.map((ser, k) => {
              const v = ser.values[g] ?? 0;
              return (
                <div key={ser.name} className="flex h-full w-full max-w-[3cqw] flex-col justify-end">
                  <div className="text-center font-mono text-[1cqw] text-mute">{v || ""}</div>
                  <div className="rounded-t-[0.3cqw]" style={{ height: `${(v / max) * 88}%`, background: SERIES[k % 2], minHeight: v ? "0.3cqw" : 0 }} />
                </div>);
            })}
          </div>))}
      </div>
      <div className="mt-[0.6cqw] flex gap-[1cqw]">{labels.map((l, i) => <div key={l + i} className="min-w-0 flex-1 truncate text-center text-[1cqw] text-mute">{l}</div>)}</div>
      <div className="mt-[1.6cqw] flex flex-wrap items-center gap-x-[2cqw] text-[1.3cqw]">
        {series.map((ser, k) => <span key={ser.name} className="flex items-center gap-[0.6cqw]"><span className="inline-block h-[1.1cqw] w-[1.1cqw] rounded-sm" style={{ background: SERIES[k % 2] }} />{ser.name}{unit}</span>)}
        {caption && <span className="italic text-mute">{caption}</span>}
      </div>
    </div>
  );
}
