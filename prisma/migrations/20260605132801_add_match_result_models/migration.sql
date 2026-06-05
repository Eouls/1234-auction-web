-- AlterTable
ALTER TABLE "InternalMatch" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "sourceType" TEXT NOT NULL DEFAULT 'OCR',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "InternalMatchPlayer" ADD COLUMN     "cs" INTEGER,
ADD COLUMN     "damage" INTEGER,
ADD COLUMN     "internalMatchTeamId" TEXT,
ADD COLUMN     "position" TEXT;

-- CreateTable
CREATE TABLE "InternalMatchTeam" (
    "id" TEXT NOT NULL,
    "internalMatchId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "teamName" TEXT,
    "auctionTeamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternalMatchTeam_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InternalMatchTeam_auctionTeamId_idx" ON "InternalMatchTeam"("auctionTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "InternalMatchTeam_internalMatchId_side_key" ON "InternalMatchTeam"("internalMatchId", "side");

-- AddForeignKey
ALTER TABLE "InternalMatch" ADD CONSTRAINT "InternalMatch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalMatchTeam" ADD CONSTRAINT "InternalMatchTeam_internalMatchId_fkey" FOREIGN KEY ("internalMatchId") REFERENCES "InternalMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalMatchTeam" ADD CONSTRAINT "InternalMatchTeam_auctionTeamId_fkey" FOREIGN KEY ("auctionTeamId") REFERENCES "AuctionTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalMatchPlayer" ADD CONSTRAINT "InternalMatchPlayer_internalMatchTeamId_fkey" FOREIGN KEY ("internalMatchTeamId") REFERENCES "InternalMatchTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
