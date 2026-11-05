-- CreateTable
CREATE TABLE "Leave" (
    "id" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ANNUAL',
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "portion" TEXT NOT NULL DEFAULT 'FULL',
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "googleEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Leave_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Leave_developerId_idx" ON "Leave"("developerId");

-- CreateIndex
CREATE INDEX "Leave_status_startDate_endDate_idx" ON "Leave"("status", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "Leave" ADD CONSTRAINT "Leave_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
