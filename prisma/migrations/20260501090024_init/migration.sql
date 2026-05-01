-- CreateEnum
CREATE TYPE "LolRole" AS ENUM ('TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT');

-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('DRAFT', 'READY', 'RUNNING', 'PAUSED', 'FINISHED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('WAITING', 'BIDDING', 'SOLD', 'UNSOLD', 'CAPTAIN');

-- CreateEnum
CREATE TYPE "ChatType" AS ENUM ('GLOBAL', 'TEAM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "authUserId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "discordUsername" TEXT,
    "discordAvatarUrl" TEXT,
    "nickname" TEXT NOT NULL,
    "customProfileImageUrl" TEXT,
    "bio" TEXT,
    "mainRole" "LolRole",
    "subRole" "LolRole",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LolAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameName" TEXT NOT NULL,
    "tagLine" TEXT NOT NULL,
    "puuid" TEXT,
    "region" TEXT NOT NULL DEFAULT 'KR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LolAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLolStats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentTier" TEXT,
    "currentRank" TEXT,
    "peakTier" TEXT,
    "peakRank" TEXT,
    "mostChampion1" TEXT,
    "mostChampion2" TEXT,
    "mostChampion3" TEXT,
    "mostChampion1ImageUrl" TEXT,
    "mostChampion2ImageUrl" TEXT,
    "mostChampion3ImageUrl" TEXT,
    "refreshedAt" TIMESTAMP(3),

    CONSTRAINT "UserLolStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "teamCount" INTEGER NOT NULL,
    "membersPerTeam" INTEGER NOT NULL,
    "auctionSeconds" INTEGER NOT NULL,
    "extendSeconds" INTEGER NOT NULL,
    "startPoints" INTEGER NOT NULL,
    "status" "AuctionStatus" NOT NULL DEFAULT 'DRAFT',
    "currentTargetParticipantId" TEXT,
    "currentBidId" TEXT,
    "currentRoundEndAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionParticipant" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'WAITING',
    "teamId" TEXT,
    "soldPrice" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuctionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionTeam" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "captainId" TEXT,
    "pointsLeft" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuctionTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionBid" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "bidderTeamId" TEXT NOT NULL,
    "bidderCaptainId" TEXT NOT NULL,
    "targetParticipantId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionBid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "teamId" TEXT,
    "type" "ChatType" NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_authUserId_key" ON "User"("authUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "User_nickname_key" ON "User"("nickname");

-- CreateIndex
CREATE UNIQUE INDEX "LolAccount_userId_gameName_tagLine_key" ON "LolAccount"("userId", "gameName", "tagLine");

-- CreateIndex
CREATE UNIQUE INDEX "UserLolStats_userId_key" ON "UserLolStats"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Auction_code_key" ON "Auction"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionParticipant_auctionId_userId_key" ON "AuctionParticipant"("auctionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionTeam_auctionId_name_key" ON "AuctionTeam"("auctionId", "name");

-- AddForeignKey
ALTER TABLE "LolAccount" ADD CONSTRAINT "LolAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLolStats" ADD CONSTRAINT "UserLolStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionParticipant" ADD CONSTRAINT "AuctionParticipant_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionParticipant" ADD CONSTRAINT "AuctionParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionParticipant" ADD CONSTRAINT "AuctionParticipant_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "AuctionTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionTeam" ADD CONSTRAINT "AuctionTeam_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionTeam" ADD CONSTRAINT "AuctionTeam_captainId_fkey" FOREIGN KEY ("captainId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
