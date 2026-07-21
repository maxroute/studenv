CREATE TABLE "StudyGroupMessageAttachment" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudyGroupMessageAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudyGroupMessageAttachment_messageId_sortOrder_idx"
  ON "StudyGroupMessageAttachment"("messageId", "sortOrder");

ALTER TABLE "StudyGroupMessageAttachment"
  ADD CONSTRAINT "StudyGroupMessageAttachment_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "StudyGroupMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "StudyGroupMessageAttachment" (
  "id",
  "messageId",
  "storageKey",
  "name",
  "mimeType",
  "sizeBytes",
  "sortOrder",
  "createdAt"
)
SELECT
  "id" || '-attachment-0',
  "id",
  "attachmentStorageKey",
  COALESCE("attachmentName", 'shared-file'),
  COALESCE("attachmentMimeType", 'application/octet-stream'),
  COALESCE("attachmentSizeBytes", 0),
  0,
  "createdAt"
FROM "StudyGroupMessage"
WHERE "attachmentStorageKey" IS NOT NULL;

ALTER TABLE "StudyGroupMessage"
  DROP COLUMN IF EXISTS "attachmentStorageKey",
  DROP COLUMN IF EXISTS "attachmentName",
  DROP COLUMN IF EXISTS "attachmentMimeType",
  DROP COLUMN IF EXISTS "attachmentSizeBytes";
