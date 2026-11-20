-- CreateTable
CREATE TABLE "RanganUsage" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RanganUsage_pkey" PRIMARY KEY ("userId","day")
);

-- AddForeignKey
ALTER TABLE "RanganUsage" ADD CONSTRAINT "RanganUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

