-- Days a task was left unfinished on before it was moved away (study calendar).
-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "missedDueDates" TIMESTAMP(3)[] DEFAULT ARRAY[]::TIMESTAMP(3)[];
