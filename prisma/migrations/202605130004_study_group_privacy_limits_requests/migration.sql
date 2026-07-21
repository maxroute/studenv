CREATE TYPE "StudyGroupPrivacy" AS ENUM ('public', 'private');
CREATE TYPE "StudyGroupJoinRequestStatus" AS ENUM ('pending', 'rejected');

ALTER TABLE "StudyGroup"
  ADD COLUMN "privacy" "StudyGroupPrivacy" NOT NULL DEFAULT 'public',
  ADD COLUMN "memberLimit" INTEGER;

CREATE TABLE "StudyGroupJoinRequest" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "StudyGroupJoinRequestStatus" NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudyGroupJoinRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudyGroupJoinRequest_groupId_userId_key"
  ON "StudyGroupJoinRequest"("groupId", "userId");

CREATE INDEX "StudyGroupJoinRequest_groupId_status_createdAt_idx"
  ON "StudyGroupJoinRequest"("groupId", "status", "createdAt" DESC);

CREATE INDEX "StudyGroupJoinRequest_userId_idx"
  ON "StudyGroupJoinRequest"("userId");

ALTER TABLE "StudyGroupJoinRequest"
  ADD CONSTRAINT "StudyGroupJoinRequest_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "StudyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudyGroupJoinRequest"
  ADD CONSTRAINT "StudyGroupJoinRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
