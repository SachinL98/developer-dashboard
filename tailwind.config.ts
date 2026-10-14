import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#07090f", panel: "#0d111b", panel2: "#121826", line: "#1f2740",
        ink: "#e6ebf7", mute: "#8a94b2",
        neon: { DEFAULT: "#6ee7ff", violet: "#a78bfa", lime: "#a3e635", pink: "#f472b6", amber: "#fbbf24", red: "#fb7185" },
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"], mono: ["JetBrains Mono", "ui-monospace", "monospace"] },
      boxShadow: { glow: "0 0 0 1px rgba(110,231,255,.25), 0 0 24px -6px rgba(110,231,255,.35)" },
    },
  },
  plugins: [],
} satisfies Config;
