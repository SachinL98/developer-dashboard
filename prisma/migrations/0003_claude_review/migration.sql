-- AlterTable
ALTER TABLE "PrReview" ADD COLUMN     "error" TEXT,
ADD COLUMN     "findings" JSONB,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DONE',
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "trigger" TEXT,
ADD COLUMN     "truncated" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "PrReview_ticketId_idx" ON "PrReview"("ticketId");

