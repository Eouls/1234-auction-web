-- CreateTable
CREATE TABLE "DatasetImage" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "originalFileName" TEXT,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sourceType" TEXT NOT NULL DEFAULT 'RESULT_UPLOAD',
    "screenType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "status" TEXT NOT NULL DEFAULT 'COLLECTED',
    "auctionId" TEXT,
    "matchId" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DatasetImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DatasetImage_auctionId_idx" ON "DatasetImage"("auctionId");

-- CreateIndex
CREATE INDEX "DatasetImage_matchId_idx" ON "DatasetImage"("matchId");

-- CreateIndex
CREATE INDEX "DatasetImage_uploadedByUserId_idx" ON "DatasetImage"("uploadedByUserId");

-- CreateIndex
CREATE INDEX "DatasetImage_sourceType_idx" ON "DatasetImage"("sourceType");

-- CreateIndex
CREATE INDEX "DatasetImage_screenType_idx" ON "DatasetImage"("screenType");

-- CreateIndex
CREATE INDEX "DatasetImage_status_idx" ON "DatasetImage"("status");

-- CreateIndex
CREATE INDEX "DatasetImage_createdAt_idx" ON "DatasetImage"("createdAt");

-- AddForeignKey
ALTER TABLE "DatasetImage" ADD CONSTRAINT "DatasetImage_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetImage" ADD CONSTRAINT "DatasetImage_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "InternalMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetImage" ADD CONSTRAINT "DatasetImage_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
