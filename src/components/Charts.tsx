"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ComposedChart } from "recharts";

const axis = { stroke: "#8a94b2", fontSize: 11, tickLine: false, axisLine: false } as const;
const tip = { contentStyle: { background: "#0d111b", border: "1px solid #1f2740", borderRadius: 10, fontSize: 12 }, labelStyle: { color: "#8a94b2" }, cursor: { fill: "rgba(110,231,255,.06)" } };

export function BurndownChart({ data, unit = "pts" }: { data: { day: string; ideal: number; actual: number | null }[]; unit?: string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ left: -18, right: 8, top: 8 }}>
        <defs><linearGradient id="bd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6ee7ff" stopOpacity={0.4} /><stop offset="100%" stopColor="#6ee7ff" stopOpacity={0} /></linearGradient></defs>
        <CartesianGrid stroke="#1f2740" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" {...axis} tickFormatter={(d: string) => d.slice(5)} />
        <YAxis {...axis} />
        <Tooltip {...tip} formatter={(v: any) => `${v} ${unit}`} />
        <Area type="monotone" dataKey="ideal" stroke="#8a94b2" strokeDasharray="5 5" fill="none" name="Ideal" dot={false} />
        <Area type="monotone" dataKey="actual" stroke="#6ee7ff" strokeWidth={2.5} fill="url(#bd)" name="Remaining" connectNulls={false} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function StatusBars({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical" margin={{ left: 40, right: 12 }}>
        <XAxis type="number" {...axis} allowDecimals={false} />
        <YAxis type="category" dataKey="name" {...axis} width={110} interval={0} />
        <Tooltip {...tip} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]}>{data.map((d) => <Cell key={d.name} fill={d.color} />)}</Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VelocityChart({ data }: { data: { name: string; committed: number; completed: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ left: -18 }}>
        <CartesianGrid stroke="#1f2740" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" {...axis} /><YAxis {...axis} />
        <Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="committed" fill="#2a3556" radius={[6, 6, 0, 0]} name="Committed pts" />
        <Bar dataKey="completed" fill="#6ee7ff" radius={[6, 6, 0, 0]} name="Completed pts" />
        <Line type="monotone" dataKey="completed" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} legendType="none" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const PALETTE = ["#6ee7ff", "#a78bfa", "#f472b6", "#a3e635", "#fbbf24", "#fb7185"];
export function StackedBars({ data, keys, unit = "" }: { data: Record<string, any>[]; keys: string[]; unit?: string }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ left: -18 }}>
        <CartesianGrid stroke="#1f2740" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" {...axis} /><YAxis {...axis} />
        <Tooltip {...tip} formatter={(v: any) => `${Math.round(v * 10) / 10}${unit}`} /><Legend wrapperStyle={{ fontSize: 12 }} />
        {keys.map((k, i) => <Bar key={k} dataKey={k} stackId="a" fill={PALETTE[i % PALETTE.length]} radius={i === keys.length - 1 ? [6, 6, 0, 0] : 0} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LineSeries({ data, lines, unit = "" }: { data: Record<string, any>[]; lines: { key: string; color: string; name: string }[]; unit?: string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ left: -18 }}>
        <CartesianGrid stroke="#1f2740" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" {...axis} /><YAxis {...axis} />
        <Tooltip {...tip} formatter={(v: any) => `${Math.round(v * 10) / 10}${unit}`} /><Legend wrapperStyle={{ fontSize: 12 }} />
        {lines.map((l) => <Line key={l.key} dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2.5} dot={{ r: 3 }} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function HBar({ data, color = "#a78bfa", unit = "" }: { data: { name: string; value: number }[]; color?: string; unit?: string }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ left: 30, right: 16 }}>
        <XAxis type="number" {...axis} /><YAxis type="category" dataKey="name" {...axis} width={120} />
        <Tooltip {...tip} formatter={(v: any) => `${Math.round(v * 10) / 10}${unit}`} />
        <Bar dataKey="value" fill={color} radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
