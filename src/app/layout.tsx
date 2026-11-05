import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "SpaceIT Dev Dashboard", description: "Sprint, time, estimation and analytics hub for SpaceIT Labs developers" };
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#07090f" }, { media: "(prefers-color-scheme: light)", color: "#f4f6fb" }] };

// Runs before first paint: picks light/dark from the saved choice (cookie); light is the default. No flash.
const THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )theme=(light|dark|system)/);var t=m?m[1]:"light";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.classList.toggle("light",!d);e.style.colorScheme=d?"dark":"light"}catch(_){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light" style={{ colorScheme: "light" }} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
