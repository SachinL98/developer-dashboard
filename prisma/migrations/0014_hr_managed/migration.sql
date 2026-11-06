-- People whose password and profile are owned by the HR app. Their local password is an unusable placeholder.
ALTER TABLE "Developer" ADD COLUMN "hrManaged" BOOLEAN NOT NULL DEFAULT false;
