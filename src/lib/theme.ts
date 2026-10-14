/**
 * Accent colours (status, type, priority, chart series) are hex values that look right on the dark theme.
 * `fg` darkens them in the light theme (via --accent-darken) so text keeps its contrast; `tint` makes a translucent fill.
 */
export const fg = (hex: string) => `color-mix(in srgb, ${hex} calc(100% - var(--accent-darken, 0%)), #000)`;
export const tint = (hex: string, pct = 12) => `color-mix(in srgb, ${hex} ${pct}%, transparent)`;

export type ThemeChoice = "light" | "dark" | "system";
export const isTheme = (v: unknown): v is ThemeChoice => v === "light" || v === "dark" || v === "system";
