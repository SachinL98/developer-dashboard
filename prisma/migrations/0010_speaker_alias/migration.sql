-- CreateTable
CREATE TABLE "SpeakerAlias" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeakerAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpeakerAlias_alias_key" ON "SpeakerAlias"("alias");

-- CreateIndex
CREATE INDEX "SpeakerAlias_developerId_idx" ON "SpeakerAlias"("developerId");
