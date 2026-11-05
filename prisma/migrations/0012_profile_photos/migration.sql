ALTER TABLE "Developer" ADD COLUMN "avatarVer" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "AvatarImage" (
    "developerId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AvatarImage_pkey" PRIMARY KEY ("developerId")
);
