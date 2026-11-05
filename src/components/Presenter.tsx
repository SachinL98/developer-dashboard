"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Maximize, X } from "lucide-react";
import type { Slide } from "@/lib/report";
import { SlideView } from "./SlideView";

/** Full-screen presenter. Keys: arrows/space/page keys to move, Home/End, F for fullscreen, Esc to leave. */
export function Presenter({ slides, exit }: { slides: Slide[]; exit: string }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const touch = useRef<number | null>(null);
  const go = useCallback((d: number) => setI((n) => Math.min(slides.length - 1, Math.max(0, n + d))), [slides.length]);
  const fullscreen = useCallback(() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.().catch(() => {}); }, []);

  useEffect(() => { const n = parseInt(location.hash.slice(1), 10); if (n >= 0 && n < slides.length) setI(n); }, [slides.length]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) { e.preventDefault(); go(1); }
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) { e.preventDefault(); go(-1); }
      else if (e.key === "Home") setI(0);
      else if (e.key === "End") setI(slides.length - 1);
      else if (e.key === "f" || e.key === "F") fullscreen();
      else if (e.key === "Escape" && !document.fullscreenElement) router.push(exit);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [go, fullscreen, router, exit, slides.length]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg" role="region" aria-roledescription="presentation" aria-label="Slides"
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { if (touch.current == null) return; const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); touch.current = null; }}>
      <div className="h-1 bg-line"><div className="h-full bg-neon transition-all" style={{ width: `${((i + 1) / slides.length) * 100}%` }} /></div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2 sm:p-6">
        <div className="w-full" style={{ maxWidth: "min(100%, calc((100vh - 7rem) * 16 / 9))" }} aria-live="polite">
          <SlideView slide={slides[i]} index={i} total={slides.length} className="shadow-glow" />
        </div>
        <p className="absolute bottom-1 left-0 right-0 text-center text-[11px] text-mute sm:hidden [@media(orientation:landscape)]:hidden">Rotate your phone for a bigger slide. Swipe to move.</p>
        <button aria-label="Previous slide" className="absolute inset-y-0 left-0 hidden w-[12%] opacity-0 sm:block" onClick={() => go(-1)} />
        <button aria-label="Next slide" className="absolute inset-y-0 right-0 hidden w-[12%] opacity-0 sm:block" onClick={() => go(1)} />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-sm">
        <button className="btn" onClick={() => router.push(exit)}><X size={14} /> Exit</button>
        <div className="flex items-center gap-2">
          <button className="btn" aria-label="Previous slide" disabled={i === 0} onClick={() => go(-1)}><ChevronLeft size={16} /></button>
          <span className="min-w-[4.5rem] text-center font-mono text-xs text-mute">{i + 1} / {slides.length}</span>
          <button className="btn" aria-label="Next slide" disabled={i === slides.length - 1} onClick={() => go(1)}><ChevronRight size={16} /></button>
        </div>
        <button className="btn" onClick={fullscreen}><Maximize size={14} /><span className="hidden sm:inline"> Fullscreen (F)</span></button>
      </div>
    </div>
  );
}
