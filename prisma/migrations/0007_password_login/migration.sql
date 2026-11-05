-- AlterTable
ALTER TABLE "Developer" ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN     "failedLogins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3);
