"use client";
import { useTransition } from "react";
import { selectDeveloper } from "@/app/actions";

export function DevSwitcher({ devs, current }: { devs: { id: string; name: string }[]; current: string }) {
  const [pending, start] = useTransition();
  return (
    <div>
      <label className="label">Working as</label>
      <select className="input" value={current} disabled={pending} onChange={(e) => start(() => selectDeveloper(e.target.value))}>
        {devs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
    </div>
  );
}
