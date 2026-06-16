-- CreateTable
CREATE TABLE "Broker" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Broker_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Broker_farmId_name_key" ON "Broker"("farmId", "name");
CREATE INDEX "Broker_farmId_idx" ON "Broker"("farmId");
ALTER TABLE "Broker" ADD CONSTRAINT "Broker_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "brokerId" TEXT;
CREATE INDEX "Sale_brokerId_idx" ON "Sale"("brokerId");
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: distinct broker names from existing sales (per farm)
INSERT INTO "Broker" ("id", "farmId", "name", "phone", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, x."farmId", x."name", NULL, NOW(), NOW()
FROM (
  SELECT DISTINCT c."farmId", TRIM(s."broker") AS "name"
  FROM "Sale" s
  INNER JOIN "Cycle" c ON c."id" = s."cycleId"
  WHERE TRIM(COALESCE(s."broker", '')) <> ''
) x
WHERE NOT EXISTS (
  SELECT 1 FROM "Broker" b WHERE b."farmId" = x."farmId" AND b."name" = x."name"
);

UPDATE "Sale" s
SET "brokerId" = b."id"
FROM "Cycle" c, "Broker" b
WHERE s."cycleId" = c."id"
  AND b."farmId" = c."farmId"
  AND b."name" = TRIM(s."broker")
  AND s."brokerId" IS NULL
  AND TRIM(COALESCE(s."broker", '')) <> '';
