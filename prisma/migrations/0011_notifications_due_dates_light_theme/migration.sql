-- AlterTable
ALTER TABLE "Developer" ADD COLUMN     "discordId" TEXT,
ADD COLUMN     "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyDiscord" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "theme" SET DEFAULT 'light';

-- Light is the default theme: people who never chose a theme (still on the old default) move to light
UPDATE "Developer" SET "theme" = 'light' WHERE "theme" = 'system';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "dueDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "channels" JSONB,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_userId_kind_dayKey_key" ON "NotificationLog"("userId", "kind", "dayKey");

-- CreateIndex
CREATE INDEX "NotificationLog_createdAt_idx" ON "NotificationLog"("createdAt");
