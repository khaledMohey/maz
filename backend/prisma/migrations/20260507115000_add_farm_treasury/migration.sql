CREATE TYPE "TreasuryEntryType" AS ENUM ('DEPOSIT', 'WITHDRAW', 'CREDIT_ADD', 'CREDIT_DEDUCT');

CREATE TABLE "TreasuryEntry" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "TreasuryEntryType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "personName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreasuryEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TreasuryEntry_farmId_date_idx" ON "TreasuryEntry"("farmId", "date");
CREATE INDEX "TreasuryEntry_farmId_type_idx" ON "TreasuryEntry"("farmId", "type");
CREATE INDEX "TreasuryEntry_farmId_personName_idx" ON "TreasuryEntry"("farmId", "personName");

ALTER TABLE "TreasuryEntry" ADD CONSTRAINT "TreasuryEntry_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
