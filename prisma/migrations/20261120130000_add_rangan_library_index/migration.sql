-- pgvector for meaning search (Neon ships it; this only enables it in this database).
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "RanganSource" (
    "sourceType" VARCHAR(16) NOT NULL,
    "sourceId" VARCHAR(128) NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "version" VARCHAR(128) NOT NULL,
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RanganSource_pkey" PRIMARY KEY ("sourceType","sourceId")
);

-- CreateTable
CREATE TABLE "RanganChunk" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sourceType" VARCHAR(16) NOT NULL,
    "sourceId" VARCHAR(128) NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "anchor" VARCHAR(256) NOT NULL DEFAULT '',
    "title" VARCHAR(500) NOT NULL,
    "heading" VARCHAR(500) NOT NULL DEFAULT '',
    "content" TEXT NOT NULL,
    "contentHash" VARCHAR(64) NOT NULL,
    "search_vector" tsvector,
    "embedding" vector(1024),
    "embeddedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RanganChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RanganSource_ownerId_idx" ON "RanganSource"("ownerId");

-- CreateIndex
CREATE INDEX "RanganChunk_ownerId_idx" ON "RanganChunk"("ownerId");

-- CreateIndex
CREATE INDEX "RanganChunk_sourceType_sourceId_idx" ON "RanganChunk"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "RanganChunk_ownerId_embeddedAt_idx" ON "RanganChunk"("ownerId", "embeddedAt");

-- AddForeignKey
ALTER TABLE "RanganSource" ADD CONSTRAINT "RanganSource_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RanganChunk" ADD CONSTRAINT "RanganChunk_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Keyword search over passages, maintained like the Note and Item ones.
-- Title and heading weigh more than body text.
CREATE OR REPLACE FUNCTION studenv_rangan_chunk_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('pg_catalog.english', coalesce(NEW.title, '') || ' ' || coalesce(NEW.heading, '')), 'A') ||
    setweight(to_tsvector('pg_catalog.english', coalesce(NEW.content, '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE INDEX "rangan_chunk_search_idx" ON "RanganChunk" USING GIN ("search_vector");

CREATE TRIGGER rangan_chunk_search_update
BEFORE INSERT OR UPDATE OF "title", "heading", "content" ON "RanganChunk"
FOR EACH ROW
EXECUTE FUNCTION studenv_rangan_chunk_search_update();
