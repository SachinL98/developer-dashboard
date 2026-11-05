"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { saveReportNoteAction } from "@/app/(app)/actions";

/** Short commentary per slide, shown on the slide in the presenter and in the exports. Leads and admins only. */
export function ReportNotes({ periodKey, slides, canEdit }: { periodKey: string; slides: { id: string; title: string; note: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const [vals, setVals] = useState(Object.fromEntries(slides.map((s) => [s.id, s.note])));
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (id: string) => start(async () => {
    const r = await saveReportNoteAction(periodKey, id, vals[id] ?? "");
    if (!r.ok) { setErr(r.error); return; }
    setErr(null); setSaved((s) => ({ ...s, [id]: true })); router.refresh();
  });
  return (
    <div className="card-pad">
      <div className="h-section mb-1">Commentary</div>
      <p className="mb-4 text-xs text-mute">{canEdit ? "A line or two per slide. It appears under the slide when presenting and in the PDF and PowerPoint exports." : "Leads and admins can add commentary to slides."}</p>
      {err && <p role="alert" className="mb-3 text-sm text-neon-red">{err}</p>}
      <ul className="grid gap-3 md:grid-cols-2">
        {slides.map((s) => (
          <li key={s.id}>
            <label className="mb-1 block text-xs font-medium text-mute" htmlFor={`note-${s.id}`}>{s.title}</label>
            <div className="flex gap-2">
              <textarea id={`note-${s.id}`} className="input min-h-[2.75rem] flex-1 resize-y" rows={2} maxLength={600} disabled={!canEdit} placeholder={canEdit ? "Add commentary…" : "No commentary"}
                value={vals[s.id] ?? ""} onChange={(e) => { setVals({ ...vals, [s.id]: e.target.value }); setSaved((x) => ({ ...x, [s.id]: false })); }} />
              {canEdit && <button className="btn self-start" disabled={pending} onClick={() => save(s.id)} aria-label={`Save commentary for ${s.title}`}>{saved[s.id] ? <Check size={14} className="text-neon-lime" /> : "Save"}</button>}
            </div>
          </li>))}
      </ul>
    </div>
  );
}
