import type { NewTicket } from "./services";

const TYPE_HINTS: [RegExp, NewTicket["type"]][] = [
  [/\b(bug|fix|crash|broken|error|fails?|regression|wrong|stale|loop)\b/i, "BUG"],
  [/\b(improve|enhance|optimi[sz]e|refactor|speed|reduce|cache|paginate)\b/i, "ENHANCEMENT"],
  [/\b(add|new|support|implement|create|allow|enable|export|import)\b/i, "FEATURE"],
];
const PRIORITY_HINTS: [RegExp, NewTicket["priority"]][] = [
  [/\b(p0|critical|urgent|outage|prod(uction)? down|data loss)\b/i, "CRITICAL"], [/\b(p1|high|asap|blocker)\b/i, "HIGH"], [/\b(p3|low|nice to have|minor)\b/i, "LOW"],
];

/** One ticket per non-empty line. Supports `[bug]`, `[feature]`, `!high`, `#label`, `(3)` for points. */
export function parseTicketLines(text: string): Pick<NewTicket, "title" | "type" | "priority" | "labels" | "storyPoints">[] {
  return text.split(/\r?\n/).map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim()).filter((l) => l.length > 3).map((line) => {
    let title = line, type: NewTicket["type"] | undefined, priority: NewTicket["priority"] | undefined, storyPoints: number | null = null;
    const tag = title.match(/^\[(bug|feature|feat|enhancement|enh|task)\]\s*/i);
    if (tag) { const k = tag[1].toLowerCase(); type = k === "bug" ? "BUG" : k.startsWith("feat") ? "FEATURE" : k.startsWith("enh") ? "ENHANCEMENT" : "TASK"; title = title.slice(tag[0].length); }
    const pr = title.match(/\s!(critical|high|medium|low)\b/i);
    if (pr) { priority = pr[1].toUpperCase() as NewTicket["priority"]; title = title.replace(pr[0], ""); }
    const pts = title.match(/\s\((\d{1,2})\)\s*$/);
    if (pts) { storyPoints = +pts[1]; title = title.replace(pts[0], ""); }
    const labels = [...title.matchAll(/\s#([\w-]+)/g)].map((m) => m[1]);
    title = title.replace(/\s#[\w-]+/g, "").trim();
    type ??= TYPE_HINTS.find(([re]) => re.test(title))?.[1] ?? "TASK";
    priority ??= PRIORITY_HINTS.find(([re]) => re.test(line))?.[1] ?? (type === "BUG" ? "HIGH" : "MEDIUM");
    return { title: title.charAt(0).toUpperCase() + title.slice(1), type, priority, labels, storyPoints };
  });
}

export const DESCRIPTION_TEMPLATES: Record<NewTicket["type"], string> = {
  BUG: "**Summary**\n\n**Steps to reproduce**\n1. \n2. \n\n**Expected**\n\n**Actual**\n\n**Environment** (browser / app version / env)\n\n**Acceptance criteria**\n- Fixed and verified on staging\n- Regression test added",
  FEATURE: "**User story**\nAs a …, I want …, so that …\n\n**Scope**\n- \n\n**Out of scope**\n- \n\n**Acceptance criteria**\n- \n\n**Migrations / seeders needed?**\n",
  ENHANCEMENT: "**Current behaviour**\n\n**Proposed improvement**\n\n**Why now**\n\n**Acceptance criteria**\n- \n",
  TASK: "**What needs doing**\n\n**Definition of done**\n- \n",
};
