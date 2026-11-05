"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Video } from "lucide-react";

const KEY = (id: string) => `joined-meeting:${id}`;
const HOURS = 12; // a join is remembered for half a day, then forgotten
const Ctx = createContext<{ joined: boolean; join: () => void }>({ joined: false, join: () => {} });

/**
 * Remembers that this person pressed Join on a meeting, so the recorder and notes steps stay visible
 * whatever the clock says: an early join, a meeting that overruns, or a page reload in the middle of the call.
 */
export function MeetingJoin({ id, children }: { id: string; children: ReactNode }) {
  const [joined, setJoined] = useState(false);
  useEffect(() => {
    try { const at = Number(localStorage.getItem(KEY(id))); if (at && Date.now() - at < HOURS * 3_600_000) setJoined(true); } catch { /* storage blocked */ }
  }, [id]);
  const join = () => { setJoined(true); try { localStorage.setItem(KEY(id), String(Date.now())); } catch { /* storage blocked */ } };
  return <Ctx.Provider value={{ joined, join }}>{children}</Ctx.Provider>;
}

/** The Join button: opens the call and switches on the recorder and notes steps. */
export function JoinButton({ url, label = "Join" }: { url: string; label?: string }) {
  const { join } = useContext(Ctx);
  return <a href={url} target="_blank" rel="noreferrer" onClick={join} className="btn-primary"><Video size={14} /> {label}</a>;
}

/** Shows `children` while the meeting is on by the clock, or as soon as the person has joined. Otherwise `fallback`. */
export function LivePanel({ liveNow, children, fallback = null }: { liveNow: boolean; children: ReactNode; fallback?: ReactNode }) {
  const { joined } = useContext(Ctx);
  return <>{liveNow || joined ? children : fallback}</>;
}

export function LiveChip({ liveNow }: { liveNow: boolean }) {
  const { joined } = useContext(Ctx);
  return liveNow || joined ? <span className="chip border-neon/40 text-neon">{joined && !liveNow ? "You joined" : "Happening now"}</span> : null;
}
