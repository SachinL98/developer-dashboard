"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Square } from "lucide-react";
import { startTimerAction, stopTimerAction } from "@/app/(app)/actions";

export function TimerButton({ ticketId, running }: { ticketId: string; running: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return running
    ? <button className="btn border-neon-red/40 px-2 py-1" disabled={pending} onClick={() => start(async () => { await stopTimerAction(); router.refresh(); })}><Square size={12} /> Stop</button>
    : <button className="btn px-2 py-1" disabled={pending} onClick={() => start(async () => { await startTimerAction(ticketId); router.refresh(); })}><Play size={12} /> Start</button>;
}
