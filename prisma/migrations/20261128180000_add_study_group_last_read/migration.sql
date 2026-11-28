-- When each member last read each group. Existing members get the time of this
-- migration, so old messages don't all turn up as unread.
-- AlterTable
ALTER TABLE "StudyGroupMember" ADD COLUMN     "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
