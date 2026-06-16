-- CreateTable
CREATE TABLE "Trader" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trader_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trader_farmId_idx" ON "Trader"("farmId");

-- CreateIndex
CREATE UNIQUE INDEX "Trader_farmId_name_key" ON "Trader"("farmId", "name");

-- AddForeignKey
ALTER TABLE "Trader" ADD CONSTRAINT "Trader_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "traderId" TEXT;

-- CreateIndex
CREATE INDEX "Sale_traderId_idx" ON "Sale"("traderId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_traderId_fkey" FOREIGN KEY ("traderId") REFERENCES "Trader"("id") ON DELETE SET NULL ON UPDATE CASCADE;
