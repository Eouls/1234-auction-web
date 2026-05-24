-- AlterTable
ALTER TABLE "Auction" ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "pausedRemainingMs" INTEGER;
