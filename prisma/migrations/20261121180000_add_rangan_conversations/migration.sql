-- CreateTable
CREATE TABLE "RanganConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RanganConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RanganConversationTurn" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "clientId" VARCHAR(64) NOT NULL,
    "position" INTEGER NOT NULL,
    "role" VARCHAR(16) NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RanganConversationTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RanganConversation_userId_updatedAt_idx" ON "RanganConversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "RanganConversationTurn_conversationId_position_idx" ON "RanganConversationTurn"("conversationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "RanganConversationTurn_conversationId_clientId_key" ON "RanganConversationTurn"("conversationId", "clientId");

-- AddForeignKey
ALTER TABLE "RanganConversation" ADD CONSTRAINT "RanganConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RanganConversationTurn" ADD CONSTRAINT "RanganConversationTurn_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "RanganConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

