ALTER TABLE "StudyGroupMessage"
  ALTER COLUMN "content" DROP NOT NULL,
  ADD COLUMN "attachmentStorageKey" TEXT,
  ADD COLUMN "attachmentName" TEXT,
  ADD COLUMN "attachmentMimeType" TEXT,
  ADD COLUMN "attachmentSizeBytes" INTEGER;
