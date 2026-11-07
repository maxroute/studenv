-- CreateEnum
CREATE TYPE "CourseNodeType" AS ENUM ('subject', 'topic', 'lecture');

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "courseNodeId" TEXT;

-- AlterTable
ALTER TABLE "FocusSession" ADD COLUMN     "courseNodeId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "courseNodeId" TEXT;

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "providerName" VARCHAR(100) NOT NULL,
    "courseUrl" VARCHAR(2000) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseNode" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "parentId" TEXT,
    "type" "CourseNodeType" NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "originalUrl" VARCHAR(2000),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseNode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Course_userId_updatedAt_idx" ON "Course"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "CourseNode_courseId_sortOrder_idx" ON "CourseNode"("courseId", "sortOrder");

-- CreateIndex
CREATE INDEX "CourseNode_parentId_sortOrder_idx" ON "CourseNode"("parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "CourseNode_courseId_type_idx" ON "CourseNode"("courseId", "type");

-- CreateIndex
CREATE INDEX "Item_courseNodeId_idx" ON "Item"("courseNodeId");

-- CreateIndex
CREATE INDEX "FocusSession_courseNodeId_status_createdAt_idx" ON "FocusSession"("courseNodeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Task_courseNodeId_idx" ON "Task"("courseNodeId");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_courseNodeId_fkey" FOREIGN KEY ("courseNodeId") REFERENCES "CourseNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseNode" ADD CONSTRAINT "CourseNode_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseNode" ADD CONSTRAINT "CourseNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CourseNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusSession" ADD CONSTRAINT "FocusSession_courseNodeId_fkey" FOREIGN KEY ("courseNodeId") REFERENCES "CourseNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_courseNodeId_fkey" FOREIGN KEY ("courseNodeId") REFERENCES "CourseNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
