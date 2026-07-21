CREATE TYPE "Plan" AS ENUM ('free', 'pro', 'team');
CREATE TYPE "ItemType" AS ENUM ('article', 'pdf', 'video', 'note');
CREATE TYPE "ItemStatus" AS ENUM ('unread', 'reading', 'done');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "emailVerified" TIMESTAMP(3),
  "name" TEXT,
  "username" TEXT,
  "bio" TEXT,
  "avatarUrl" TEXT,
  "passwordHash" TEXT,
  "plan" "Plan" NOT NULL DEFAULT 'free',
  "loginAttempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "lastLoginAt" TIMESTAMP(3),
  "lastLoginIp" TEXT,
  "emailVerifyToken" TEXT,
  "passwordResetToken" TEXT,
  "passwordResetExpiry" TIMESTAMP(3),
  "twoFactorSecret" TEXT,
  "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
  "refreshTokenHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "sessionToken" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Account" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" TEXT,
  "scope" TEXT,
  "id_token" TEXT,
  "session_state" TEXT,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VerificationToken" (
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "Item" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "ItemType" NOT NULL,
  "title" VARCHAR(500) NOT NULL,
  "url" VARCHAR(2000),
  "excerpt" TEXT,
  "notes" TEXT,
  "status" "ItemStatus" NOT NULL DEFAULT 'unread',
  "starred" BOOLEAN NOT NULL DEFAULT false,
  "sourceHost" TEXT,
  "search_vector" tsvector,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Tag" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "color" VARCHAR(7) NOT NULL DEFAULT '#f5a623',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ItemTag" (
  "itemId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  CONSTRAINT "ItemTag_pkey" PRIMARY KEY ("itemId", "tagId")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "action" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "resourceId" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "metadata" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_emailVerifyToken_key" ON "User"("emailVerifyToken");
CREATE UNIQUE INDEX "User_passwordResetToken_key" ON "User"("passwordResetToken");
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");
CREATE UNIQUE INDEX "Tag_userId_name_key" ON "Tag"("userId", "name");

CREATE INDEX "Item_userId_idx" ON "Item"("userId");
CREATE INDEX "Item_userId_status_idx" ON "Item"("userId", "status");
CREATE INDEX "Item_userId_type_idx" ON "Item"("userId", "type");
CREATE INDEX "Item_userId_starred_idx" ON "Item"("userId", "starred");
CREATE INDEX "Item_userId_createdAt_idx" ON "Item"("userId", "createdAt" DESC);
CREATE INDEX "Tag_userId_idx" ON "Tag"("userId");
CREATE INDEX "ItemTag_tagId_idx" ON "ItemTag"("tagId");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Account"
  ADD CONSTRAINT "Account_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Item"
  ADD CONSTRAINT "Item_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Tag"
  ADD CONSTRAINT "Tag_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ItemTag"
  ADD CONSTRAINT "ItemTag_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "Item"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ItemTag"
  ADD CONSTRAINT "ItemTag_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "Tag"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION second_brain_items_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector(
      'pg_catalog.english',
      coalesce(NEW.title, '') || ' ' ||
      coalesce(NEW.excerpt, '') || ' ' ||
      coalesce(NEW.notes, '')
    );
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE INDEX "items_search_idx" ON "Item" USING GIN ("search_vector");

CREATE TRIGGER items_search_update
BEFORE INSERT OR UPDATE ON "Item"
FOR EACH ROW
EXECUTE FUNCTION second_brain_items_search_update();
