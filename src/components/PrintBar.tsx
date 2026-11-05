"use client";
import Link from "next/link";
import { Printer, ArrowLeft } from "lucide-react";

export function PrintBar({ back }: { back: string }) {
  return (
    <div className="no-print sticky top-0 z-10 mb-4 flex items-center justify-between gap-2 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur">
      <Link href={back} className="btn"><ArrowLeft size={14} /> Back</Link>
      <span className="hidden text-sm text-mute sm:inline">Choose &ldquo;Save as PDF&rdquo; in the print dialog.</span>
      <button className="btn-primary" onClick={() => window.print()}><Printer size={14} /> Print / Save as PDF</button>
    </div>
  );
}
