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
      <PageHeader title="PR review" sub="The checklist Claude uses for the initial review of each ticket's pull request, and when it runs." />
      <ReviewTemplateEditor initial={cfg} projects={projects} status={{ claude: anthropicConfigured(), github: githubConfigured(), model: reviewModel() }} />
    </div>
  );
}
