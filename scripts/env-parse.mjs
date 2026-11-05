// Parsing of .env style lines. No side effects, so tests can import it.
/** NAME=value, NAME="value" # comment, NAME=value  # comment. Returns null for lines that are not assignments. */
export function parseLine(line) {
  const t = line.trim();
  if (!t || t.startsWith("#")) return null;
  const eq = t.indexOf("=");
  if (eq < 1) return null;
  const name = t.slice(0, eq).trim();
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) return null;
  let rest = t.slice(eq + 1).trim();
  let value;
  if (rest.startsWith('"')) { const m = rest.match(/^"((?:[^"\\]|\\.)*)"/); value = m ? m[1] : rest.slice(1); }
  else if (rest.startsWith("'")) { const m = rest.match(/^'([^']*)'/); value = m ? m[1] : rest.slice(1); }
  else value = rest.split(/\s+#/)[0].trim();
  return { name, value: value.trim() };
}
