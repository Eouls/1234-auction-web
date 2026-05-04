ALTER TABLE "InternalMatch" ADD COLUMN "gameNumber" INTEGER;
ALTER TABLE "InternalMatch" ADD COLUMN "matchFingerprint" TEXT;

WITH numbered_matches AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "auctionId"
      ORDER BY "playedAt" ASC, "createdAt" ASC, "id" ASC
    ) AS "gameNumber"
  FROM "InternalMatch"
)
UPDATE "InternalMatch"
SET "gameNumber" = numbered_matches."gameNumber"
FROM numbered_matches
WHERE "InternalMatch"."id" = numbered_matches."id";

ALTER TABLE "InternalMatch" ALTER COLUMN "gameNumber" SET NOT NULL;

CREATE UNIQUE INDEX "InternalMatch_auctionId_gameNumber_key" ON "InternalMatch"("auctionId", "gameNumber");
CREATE UNIQUE INDEX "InternalMatch_auctionId_matchFingerprint_key" ON "InternalMatch"("auctionId", "matchFingerprint");
