-- AlterTable
ALTER TABLE "WorkSession" ADD COLUMN     "planTicketIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "planNote" TEXT,
ADD COLUMN     "doneTicketIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "doneNote" TEXT;
