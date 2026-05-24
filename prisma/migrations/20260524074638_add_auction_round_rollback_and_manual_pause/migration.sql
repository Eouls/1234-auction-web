-- AlterTable
ALTER TABLE "Auction" ADD COLUMN     "pauseReason" TEXT;

-- CreateTable
CREATE TABLE "AuctionRoundSnapshot" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "targetParticipantId" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionRoundSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuctionRoundSnapshot_auctionId_idx" ON "AuctionRoundSnapshot"("auctionId");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionRoundSnapshot_auctionId_roundNumber_key" ON "AuctionRoundSnapshot"("auctionId", "roundNumber");

-- AddForeignKey
ALTER TABLE "AuctionRoundSnapshot" ADD CONSTRAINT "AuctionRoundSnapshot_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
