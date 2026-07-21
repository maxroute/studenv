CREATE TYPE "StudyGroupMemberRole" AS ENUM ('owner', 'member');

CREATE TABLE "StudyGroup" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "inviteCode" VARCHAR(12) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudyGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudyGroupMember" (
  "groupId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "StudyGroupMemberRole" NOT NULL DEFAULT 'member',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudyGroupMember_pkey" PRIMARY KEY ("groupId","userId")
);

CREATE TABLE "StudyGroupMessage" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudyGroupMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudyGroup_inviteCode_key" ON "StudyGroup"("inviteCode");
CREATE INDEX "StudyGroup_ownerId_idx" ON "StudyGroup"("ownerId");
CREATE INDEX "StudyGroup_createdAt_idx" ON "StudyGroup"("createdAt" DESC);
CREATE INDEX "StudyGroupMember_userId_idx" ON "StudyGroupMember"("userId");
CREATE INDEX "StudyGroupMessage_groupId_createdAt_idx" ON "StudyGroupMessage"("groupId", "createdAt" DESC);
CREATE INDEX "StudyGroupMessage_authorId_idx" ON "StudyGroupMessage"("authorId");

ALTER TABLE "StudyGroup"
  ADD CONSTRAINT "StudyGroup_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudyGroupMember"
  ADD CONSTRAINT "StudyGroupMember_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "StudyGroup"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudyGroupMember"
  ADD CONSTRAINT "StudyGroupMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudyGroupMessage"
  ADD CONSTRAINT "StudyGroupMessage_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "StudyGroup"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudyGroupMessage"
  ADD CONSTRAINT "StudyGroupMessage_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
