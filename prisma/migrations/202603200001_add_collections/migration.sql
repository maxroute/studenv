CREATE TABLE "Collection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollectionItem" (
  "collectionId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  CONSTRAINT "CollectionItem_pkey" PRIMARY KEY ("collectionId", "itemId")
);

CREATE INDEX "Collection_userId_idx" ON "Collection"("userId");
CREATE INDEX "Collection_userId_createdAt_idx" ON "Collection"("userId", "createdAt" DESC);
CREATE INDEX "CollectionItem_itemId_idx" ON "CollectionItem"("itemId");

ALTER TABLE "Collection"
  ADD CONSTRAINT "Collection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CollectionItem"
  ADD CONSTRAINT "CollectionItem_collectionId_fkey"
  FOREIGN KEY ("collectionId") REFERENCES "Collection"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CollectionItem"
  ADD CONSTRAINT "CollectionItem_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "Item"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
