-- Step 2 of 2 (design doc §7.3). Every card was backfilled in step 1: each had
-- a required analysis whose asset has a required owner.
-- DropForeignKey
ALTER TABLE "Flashcard" DROP CONSTRAINT "Flashcard_aiAnalysisId_fkey";

-- AlterTable
ALTER TABLE "Flashcard" ALTER COLUMN "aiAnalysisId" DROP NOT NULL,
ALTER COLUMN "ownerId" SET NOT NULL;

-- CreateTable
CREATE TABLE "FlashcardReview" (
    "id" TEXT NOT NULL,
    "flashcardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "algorithm" VARCHAR(16) NOT NULL DEFAULT 'fsrs',
    "state" VARCHAR(16) NOT NULL DEFAULT 'new',
    "due" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stability" DOUBLE PRECISION,
    "difficulty" DOUBLE PRECISION,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" TIMESTAMP(3),

    CONSTRAINT "FlashcardReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlashcardReviewLog" (
    "id" TEXT NOT NULL,
    "flashcardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "elapsedMs" INTEGER,

    CONSTRAINT "FlashcardReviewLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FlashcardReview_userId_due_idx" ON "FlashcardReview"("userId", "due");

-- CreateIndex
CREATE UNIQUE INDEX "FlashcardReview_flashcardId_userId_key" ON "FlashcardReview"("flashcardId", "userId");

-- CreateIndex
CREATE INDEX "FlashcardReviewLog_userId_reviewedAt_idx" ON "FlashcardReviewLog"("userId", "reviewedAt");

-- CreateIndex
CREATE INDEX "Flashcard_ownerId_sourceType_sourceId_idx" ON "Flashcard"("ownerId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "Flashcard_aiAnalysisId_idx" ON "Flashcard"("aiAnalysisId");

-- AddForeignKey
ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_aiAnalysisId_fkey" FOREIGN KEY ("aiAnalysisId") REFERENCES "AiAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardReview" ADD CONSTRAINT "FlashcardReview_flashcardId_fkey" FOREIGN KEY ("flashcardId") REFERENCES "Flashcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardReview" ADD CONSTRAINT "FlashcardReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardReviewLog" ADD CONSTRAINT "FlashcardReviewLog_flashcardId_fkey" FOREIGN KEY ("flashcardId") REFERENCES "Flashcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardReviewLog" ADD CONSTRAINT "FlashcardReviewLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

