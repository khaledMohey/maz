-- Register distinct trader names from historical sales (per farm).
INSERT INTO "Trader" ("id", "farmId", "name", "phone", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, x."farmId", x."name", NULL, NOW(), NOW()
FROM (
  SELECT DISTINCT c."farmId", TRIM(s."trader") AS "name"
  FROM "Sale" s
  INNER JOIN "Cycle" c ON c."id" = s."cycleId"
  WHERE TRIM(COALESCE(s."trader", '')) <> ''
) x
WHERE NOT EXISTS (
  SELECT 1 FROM "Trader" t WHERE t."farmId" = x."farmId" AND t."name" = x."name"
);

-- Link sales to Trader rows by matching farm + trader name.
UPDATE "Sale" s
SET "traderId" = t."id"
FROM "Cycle" c, "Trader" t
WHERE s."cycleId" = c."id"
  AND t."farmId" = c."farmId"
  AND t."name" = TRIM(s."trader")
  AND s."traderId" IS NULL
  AND TRIM(COALESCE(s."trader", '')) <> '';
