-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "linkHash" VARCHAR(64);

-- CreateTable
CREATE TABLE "ContentLink" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sourceType" VARCHAR(32) NOT NULL,
    "sourceId" VARCHAR(128) NOT NULL,
    "sourceAnchor" VARCHAR(256) NOT NULL DEFAULT '',
    "targetType" VARCHAR(32) NOT NULL,
    "targetId" VARCHAR(128) NOT NULL,
    "targetAnchor" VARCHAR(256) NOT NULL DEFAULT '',
    "kind" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentLink_ownerId_targetType_targetId_targetAnchor_idx" ON "ContentLink"("ownerId", "targetType", "targetId", "targetAnchor");

-- CreateIndex
CREATE INDEX "ContentLink_sourceType_sourceId_idx" ON "ContentLink"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentLink_sourceType_sourceId_sourceAnchor_targetType_tar_key" ON "ContentLink"("sourceType", "sourceId", "sourceAnchor", "targetType", "targetId", "targetAnchor", "kind");

