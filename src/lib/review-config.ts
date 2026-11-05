import { db } from "./db";
import { REVIEW_TEMPLATE, type ReviewItem, type Severity } from "./review-template";

/** One checklist point. The team template is the same for every project; each project can add its own critical / important points. */
export interface TemplateItem { id: string; label: string; severity: Severity; enabled: boolean }
export interface ReviewConfig {
  autoRun: boolean; // run the Claude review automatically when a card with a PR reaches Initial Review (and when the PR gets new commits)
  postToPr: boolean; // also post the result as a comment on the pull request
  global: { guidance: string; items: TemplateItem[] };
  projects: Record<string, { guidance: string; items: TemplateItem[] }>; // keyed by project key, e.g. ATL
}

export const defaultReviewConfig = (): ReviewConfig => ({
  autoRun: true, postToPr: false,
  global: { guidance: "", items: REVIEW_TEMPLATE.map((i) => ({ id: i.id, label: i.label, severity: i.severity, enabled: true })) },
  projects: {},
});

export async function getReviewConfig(): Promise<ReviewConfig> {
  const row = await db.appSetting.findUnique({ where: { key: "review.config" } }).catch(() => null);
  const v = (row?.value ?? {}) as Partial<ReviewConfig>;
  const d = defaultReviewConfig();
  return { autoRun: v.autoRun ?? d.autoRun, postToPr: v.postToPr ?? d.postToPr, global: { guidance: v.global?.guidance ?? "", items: v.global?.items?.length ? v.global.items : d.global.items }, projects: v.projects ?? {} };
}
export async function saveReviewConfig(c: ReviewConfig) {
  await db.appSetting.upsert({ where: { key: "review.config" }, update: { value: c as any }, create: { key: "review.config", value: c as any } });
}

/** The checklist for a project: enabled team points, then that project's points (ids prefixed `p:` so they can't clash). */
export function templateFor(cfg: ReviewConfig, projectKey: string): { items: ReviewItem[]; guidance: string } {
  const proj = cfg.projects[projectKey];
  const items: ReviewItem[] = [
    ...cfg.global.items.filter((i) => i.enabled).map((i) => ({ id: i.id, label: i.label, severity: i.severity, checked: false })),
    ...(proj?.items ?? []).filter((i) => i.enabled).map((i) => ({ id: `p:${i.id}`, label: i.label, severity: i.severity, checked: false, project: true } as ReviewItem)),
  ];
  const guidance = [cfg.global.guidance, proj?.guidance].map((g) => g?.trim()).filter(Boolean).join("\n\n");
  return { items, guidance };
}
