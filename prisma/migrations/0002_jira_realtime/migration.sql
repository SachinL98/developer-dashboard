-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "estimateSyncError" TEXT,
ADD COLUMN     "estimateSyncedAt" TIMESTAMP(3),
ADD COLUMN     "jiraStatus" TEXT;

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

