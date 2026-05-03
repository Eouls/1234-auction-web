ALTER TABLE "LolAccount" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

WITH ordered_accounts AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "userId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) - 1 AS "newSortOrder"
  FROM "LolAccount"
)
UPDATE "LolAccount"
SET "sortOrder" = ordered_accounts."newSortOrder"
FROM ordered_accounts
WHERE "LolAccount"."id" = ordered_accounts."id";
