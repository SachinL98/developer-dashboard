import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)", panel: "rgb(var(--panel) / <alpha-value>)", panel2: "rgb(var(--panel2) / <alpha-value>)", line: "rgb(var(--line) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)", mute: "rgb(var(--mute) / <alpha-value>)", "on-accent": "rgb(var(--on-accent) / <alpha-value>)",
        neon: { DEFAULT: "rgb(var(--neon) / <alpha-value>)", violet: "rgb(var(--neon-violet) / <alpha-value>)", lime: "rgb(var(--neon-lime) / <alpha-value>)", pink: "rgb(var(--neon-pink) / <alpha-value>)", amber: "rgb(var(--neon-amber) / <alpha-value>)", red: "rgb(var(--neon-red) / <alpha-value>)" },
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"], mono: ["JetBrains Mono", "ui-monospace", "monospace"] },
      boxShadow: { glow: "var(--glow)" },
    },
  },
  plugins: [],
} satisfies Config;
