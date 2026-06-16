-- CreateTable
CREATE TABLE "WeightEntry" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "averageWeight" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeightEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeightEntry_cycleId_date_idx" ON "WeightEntry"("cycleId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WeightEntry_cycleId_date_key" ON "WeightEntry"("cycleId", "date");

-- AddForeignKey
ALTER TABLE "WeightEntry" ADD CONSTRAINT "WeightEntry_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
