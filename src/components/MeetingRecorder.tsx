"use client";
import { useEffect, useRef, useState } from "react";
import { Circle, Square } from "lucide-react";
import clsx from "clsx";

const CLIP_SEC = 75; // short, self-contained clips keep every upload small and let the transcript appear while the meeting runs
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const pickMime = () => ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";

/**
 * Records the meeting in the browser (any modern browser: Chrome, Edge, Firefox, Safari), sends short clips to the server for
 * transcription with speaker detection, and hands the finished transcript back. Nobody has to say who is speaking.
 * "Include a browser tab" also records the other participants of an online call (Chrome and Edge can share a tab's audio).
 */
export function MeetingRecorder({ meetingId, getText, onLines, onFinished, disabled }: {
  meetingId: string; getText: () => string; onLines: (lines: string) => void; onFinished: () => void; disabled?: boolean;
}) {
  const [on, setOn] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [clips, setClips] = useState({ sent: 0, done: 0 });
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const st = useRef<{ stream?: MediaStream; ctx?: AudioContext; owned: MediaStream[]; rec?: MediaRecorder; timer?: ReturnType<typeof setTimeout>; t0: number; offset: number; stopping: boolean; queue: Promise<void>; pending: number; lock?: any }>({ owned: [], t0: 0, offset: 0, stopping: false, queue: Promise.resolve(), pending: 0 });
  const canTab = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
  const canRecord = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - st.current.t0) / 1000)), 1000);
    return () => clearInterval(t);
  }, [on]);
  useEffect(() => () => { const s = st.current; s.stopping = true; clearTimeout(s.timer); try { s.rec?.stop(); } catch {} s.owned.forEach((m) => m.getTracks().forEach((t) => t.stop())); s.ctx?.close().catch(() => {}); }, []);

  async function send(blob: Blob, offset: number) {
    const s = st.current;
    s.pending++; setClips((c) => ({ ...c, sent: c.sent + 1 }));
    s.queue = s.queue.then(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const f = new FormData();
          f.set("audio", blob, "clip"); f.set("offset", String(offset)); f.set("recent", getText().split("\n").slice(-8).join("\n"));
          const r = await fetch(`/api/meetings/${meetingId}/audio`, { method: "POST", body: f });
          const j = await r.json().catch(() => ({ ok: false, error: "Unreadable answer from the server." }));
          if (j.ok) { if (j.text) onLines(j.text); setClips((c) => ({ ...c, done: c.done + 1 })); break; }
          if (r.status < 500 && r.status !== 429) { setErr(j.error ?? "Transcription failed."); break; } // a clear refusal (no key, too large): retrying will not help
          if (attempt === 2) setErr(j.error ?? "Transcription failed.");
        } catch { if (attempt === 2) setErr("The connection dropped. Part of the recording could not be transcribed."); }
        await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
      }
      s.pending--;
      if (s.stopping && s.pending === 0) onFinished();
    });
  }

  function startClip() {
    const s = st.current;
    if (!s.stream) return;
    const mime = pickMime();
    const rec = new MediaRecorder(s.stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24_000 });
    const parts: Blob[] = [];
    const offset = s.offset;
    const began = Date.now();
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    rec.onstop = () => {
      s.offset = offset + Math.round((Date.now() - began) / 1000);
      if (parts.length) void send(new Blob(parts, { type: rec.mimeType || mime || "audio/webm" }), offset);
      else if (s.stopping && s.pending === 0) onFinished();
      if (!s.stopping) startClip();
    };
    rec.start(); s.rec = rec;
    s.timer = setTimeout(() => { try { rec.stop(); } catch {} }, CLIP_SEC * 1000);
  }

  async function start() {
    setErr(null); setInfo(null);
    const s = st.current;
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      s.owned = [mic];
      let stream = mic;
      if (tab && canTab) {
        try {
          const disp = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          s.owned.push(disp);
          if (disp.getAudioTracks().length) {
            const ctx = new AudioContext(); const dest = ctx.createMediaStreamDestination();
            ctx.createMediaStreamSource(mic).connect(dest); ctx.createMediaStreamSource(new MediaStream(disp.getAudioTracks())).connect(dest);
            s.ctx = ctx; stream = dest.stream;
            disp.getVideoTracks().forEach((t) => { t.onended = () => { if (st.current.rec) void stop(); }; });
          } else setInfo("That share has no audio. When sharing, choose a browser tab and tick 'Share tab audio'. Recording the microphone only.");
        } catch { setInfo("Tab sharing was cancelled. Recording the microphone only."); }
      } else if (!tab) setInfo("Recording the microphone. Other people on an online call are picked up if they play through your speakers; for clean results choose 'Include a browser tab'.");
      s.stream = stream; s.stopping = false; s.offset = 0; s.t0 = Date.now(); s.pending = 0; s.queue = Promise.resolve();
      setClips({ sent: 0, done: 0 }); setElapsed(0); setOn(true);
      try { s.lock = await (navigator as any).wakeLock?.request("screen"); } catch {}
      startClip();
    } catch (e) {
      s.owned.forEach((m) => m.getTracks().forEach((t) => t.stop())); s.owned = [];
      setErr(e instanceof DOMException && e.name === "NotAllowedError" ? "Microphone access was blocked. Allow it in the browser's address bar and try again." : "Could not start recording on this device.");
    }
  }

  async function stop() {
    const s = st.current;
    s.stopping = true; clearTimeout(s.timer);
    try { s.rec?.stop(); } catch {}
    s.owned.forEach((m) => m.getTracks().forEach((t) => t.stop())); s.owned = [];
    s.ctx?.close().catch(() => {}); s.ctx = undefined;
    try { await s.lock?.release(); } catch {}
    setOn(false); setInfo("Finishing the last clip, then writing the notes…");
  }

  if (!canRecord) return <span className="text-xs text-mute">Recording is not available in this browser. Import from Meet or upload a transcript instead.</span>;
  const waiting = clips.sent - clips.done;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {on ? (
        <button className="btn border-neon-red/60 px-2 py-1 text-neon-red" onClick={stop}><Square size={13} /> Stop · {fmt(elapsed)}</button>
      ) : (
        <button className="btn px-2 py-1" disabled={disabled} onClick={start}><Circle size={13} className="fill-neon-red text-neon-red" /> Record meeting</button>
      )}
      {!on && canTab && <label className="flex items-center gap-1.5 text-xs text-mute"><input type="checkbox" checked={tab} onChange={(e) => setTab(e.target.checked)} /> Include a browser tab (online call)</label>}
      {on && <span className={clsx("flex items-center gap-1.5 text-xs", waiting > 0 ? "text-neon-amber" : "text-mute")}><span className="h-2 w-2 animate-pulse rounded-full bg-neon-red" /> {clips.done} clip{clips.done === 1 ? "" : "s"} transcribed{waiting > 0 ? `, ${waiting} in progress` : ""}</span>}
      {info && <span className="text-xs text-mute" role="status">{info}</span>}
      {err && <span className="text-xs text-neon-red" role="alert">{err}</span>}
    </div>
  );
}
