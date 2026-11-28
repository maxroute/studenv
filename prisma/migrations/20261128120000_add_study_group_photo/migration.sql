-- A study group's picture (file name under group-photos/). Nullable, so existing groups are unchanged.
-- AlterTable
ALTER TABLE "StudyGroup" ADD COLUMN     "photoName" VARCHAR(200);
