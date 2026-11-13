-- CreateEnum
CREATE TYPE "NoteRevisionReason" AS ENUM ('checkpoint', 'manual', 'before_restore', 'before_overwrite', 'migration');

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "itemId" TEXT,
    "parentId" TEXT,
    "sortKey" VARCHAR(64) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "docJson" TEXT NOT NULL,
    "docFormat" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "plainText" TEXT NOT NULL,
    "search_vector" tsvector,
    "lastRevisionAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteRevision" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "docJson" TEXT NOT NULL,
    "docFormat" INTEGER NOT NULL,
    "reason" "NoteRevisionReason" NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Note_itemId_key" ON "Note"("itemId");

-- CreateIndex
CREATE INDEX "Note_ownerId_parentId_sortKey_idx" ON "Note"("ownerId", "parentId", "sortKey");

-- CreateIndex
CREATE INDEX "Note_ownerId_updatedAt_idx" ON "Note"("ownerId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "NoteRevision_noteId_createdAt_idx" ON "NoteRevision"("noteId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "NoteRevision_noteId_version_reason_key" ON "NoteRevision"("noteId", "version", "reason");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Note"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteRevision" ADD CONSTRAINT "NoteRevision_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Full-text search over note titles and plain text, maintained like the Item one.
CREATE OR REPLACE FUNCTION studenv_notes_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector(
      'pg_catalog.english',
      coalesce(NEW.title, '') || ' ' ||
      coalesce(NEW."plainText", '')
    );
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE INDEX "notes_search_idx" ON "Note" USING GIN ("search_vector");

CREATE TRIGGER notes_search_update
BEFORE INSERT OR UPDATE ON "Note"
FOR EACH ROW
EXECUTE FUNCTION studenv_notes_search_update();
