-- CreateTable
CREATE TABLE "UserAuctionStats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalSoldPrice" INTEGER NOT NULL DEFAULT 0,
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "averageSoldPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastSoldPrice" INTEGER,
    "lastSoldAuctionId" TEXT,
    "lastSoldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAuctionStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionSoldRecord" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "soldPrice" INTEGER NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionSoldRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserAuctionStats_userId_key" ON "UserAuctionStats"("userId");

-- CreateIndex
CREATE INDEX "AuctionSoldRecord_userId_idx" ON "AuctionSoldRecord"("userId");

-- CreateIndex
CREATE INDEX "AuctionSoldRecord_auctionId_idx" ON "AuctionSoldRecord"("auctionId");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionSoldRecord_auctionId_participantId_key" ON "AuctionSoldRecord"("auctionId", "participantId");

-- AddForeignKey
ALTER TABLE "UserAuctionStats" ADD CONSTRAINT "UserAuctionStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAuctionStats" ADD CONSTRAINT "UserAuctionStats_lastSoldAuctionId_fkey" FOREIGN KEY ("lastSoldAuctionId") REFERENCES "Auction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionSoldRecord" ADD CONSTRAINT "AuctionSoldRecord_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionSoldRecord" ADD CONSTRAINT "AuctionSoldRecord_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "AuctionParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionSoldRecord" ADD CONSTRAINT "AuctionSoldRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionSoldRecord" ADD CONSTRAINT "AuctionSoldRecord_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "AuctionTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
