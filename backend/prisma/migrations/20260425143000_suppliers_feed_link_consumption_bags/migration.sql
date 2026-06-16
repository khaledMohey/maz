-- Suppliers per farm
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Supplier_farmId_name_key" ON "Supplier"("farmId", "name");
CREATE INDEX "Supplier_farmId_idx" ON "Supplier"("farmId");

ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Link feed purchases to supplier
ALTER TABLE "Feed" ADD COLUMN "supplierId" TEXT;

CREATE INDEX "Feed_supplierId_idx" ON "Feed"("supplierId");

ALTER TABLE "Feed" ADD CONSTRAINT "Feed_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Daily consumption: optional bag count when entered as bags (15 kg each)
ALTER TABLE "DailyConsumption" ADD COLUMN "consumptionBags" DECIMAL(10,2);
