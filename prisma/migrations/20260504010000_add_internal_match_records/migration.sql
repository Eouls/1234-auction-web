-- CreateTable
CREATE TABLE "InternalMatch" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "screenshotUrl" TEXT,
    "resultText" TEXT,
    "winningSide" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternalMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalMatchPlayer" (
    "id" TEXT NOT NULL,
    "internalMatchId" TEXT NOT NULL,
    "userId" TEXT,
    "auctionTeamId" TEXT,
    "side" TEXT NOT NULL,
    "rawPlayerName" TEXT,
    "championName" TEXT,
    "championId" TEXT,
    "championImageUrl" TEXT,
    "kills" INTEGER,
    "deaths" INTEGER,
    "assists" INTEGER,
    "win" BOOLEAN NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalMatchPlayer_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "InternalMatch" ADD CONSTRAINT "InternalMatch_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalMatchPlayer" ADD CONSTRAINT "InternalMatchPlayer_internalMatchId_fkey" FOREIGN KEY ("internalMatchId") REFERENCES "InternalMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalMatchPlayer" ADD CONSTRAINT "InternalMatchPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalMatchPlayer" ADD CONSTRAINT "InternalMatchPlayer_auctionTeamId_fkey" FOREIGN KEY ("auctionTeamId") REFERENCES "AuctionTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
