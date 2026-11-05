-- AlterTable
ALTER TABLE "Developer" ADD COLUMN     "aiProvider" TEXT;

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "richNotes" JSONB,
ADD COLUMN     "durationSec" INTEGER,
ADD COLUMN     "transcriptSource" TEXT;

-- CreateTable
CREATE TABLE "MeetingSpeaker" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "developerId" TEXT,
    "talkSec" INTEGER NOT NULL,
    "words" INTEGER NOT NULL,
    "turns" INTEGER NOT NULL,
    "estimated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MeetingSpeaker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingSpeaker_meetingId_idx" ON "MeetingSpeaker"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingSpeaker_developerId_idx" ON "MeetingSpeaker"("developerId");

-- AddForeignKey
ALTER TABLE "MeetingSpeaker" ADD CONSTRAINT "MeetingSpeaker_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
