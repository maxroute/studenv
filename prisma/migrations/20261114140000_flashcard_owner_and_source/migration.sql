-- CreateEnum
CREATE TYPE "FlashcardOrigin" AS ENUM ('ai_generated', 'manual', 'note_block');

-- AlterTable
ALTER TABLE "Flashcard" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "origin" "FlashcardOrigin" NOT NULL DEFAULT 'ai_generated',
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "sourceId" VARCHAR(128),
ADD COLUMN     "sourceRef" VARCHAR(420),
ADD COLUMN     "sourceType" VARCHAR(32),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;


-- Backfill (step 1 of 2, design doc §7.3): every existing card came from an
-- AI analysis of a media asset, so its owner is the asset's owner and its
-- source is that asset. Step 2 makes ownerId required.
UPDATE "Flashcard" AS f
SET "ownerId" = m."ownerId",
    "sourceRef" = 'asset:' || m."id",
    "sourceType" = 'asset',
    "sourceId" = m."id"
FROM "AiAnalysis" AS a
JOIN "MediaAsset" AS m ON m."id" = a."assetId"
WHERE a."id" = f."aiAnalysisId" AND f."ownerId" IS NULL;
