"use client";
import { useState, useTransition } from "react";
import { CalendarPlus } from "lucide-react";
import { createRecurringMeetEventsAction } from "@/app/(app)/actions";

export function RecurringButton({ disabled }: { disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {msg && <span className="max-w-[240px] truncate text-xs text-mute" title={msg}>{msg}</span>}
      <button className="btn" disabled={disabled || pending} title={disabled ? "Add Google credentials first" : "Create the whole weekly cadence as recurring Google Calendar events with Meet links"}
        onClick={() => start(async () => { const r = await createRecurringMeetEventsAction(); setMsg(r.ok ? `Created ${r.created} recurring events` : r.error); })}>
        <CalendarPlus size={14} /> Create recurring Meets
      </button>
    </div>
  );
}
