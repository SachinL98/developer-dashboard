import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { ReviewTemplateEditor } from "@/components/ReviewTemplateEditor";
import { getReviewConfig } from "@/lib/review-config";
import { anthropicConfigured, reviewModel } from "@/lib/claude-review";
import { githubConfigured } from "@/lib/integrations/github";

export const dynamic = "force-dynamic";

export default async function AdminReview() {
  const [cfg, projects] = await Promise.all([getReviewConfig(), db.project.findMany({ orderBy: { key: "asc" }, select: { key: true, name: true } })]);
  return (
    <div className="space-y-6">
      <PageHeader title="Code review" sub="The checklist used to review each pull request." />
      <ReviewTemplateEditor initial={cfg} projects={projects} status={{ claude: anthropicConfigured(), github: githubConfigured(), model: reviewModel() }} />
    </div>
  );
}
