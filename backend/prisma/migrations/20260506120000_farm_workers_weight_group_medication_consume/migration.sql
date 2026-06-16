-- Farm-level workers (code) linked to cycle workers
CREATE TABLE "FarmWorker" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FarmWorker_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FarmWorker_farmId_code_key" ON "FarmWorker"("farmId", "code");
CREATE INDEX "FarmWorker_farmId_idx" ON "FarmWorker"("farmId");

ALTER TABLE "FarmWorker" ADD CONSTRAINT "FarmWorker_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Worker" ADD COLUMN "farmWorkerId" TEXT;
CREATE INDEX "Worker_farmWorkerId_idx" ON "Worker"("farmWorkerId");
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_farmWorkerId_fkey" FOREIGN KEY ("farmWorkerId") REFERENCES "FarmWorker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkerExpense" ADD COLUMN "category" TEXT DEFAULT 'صرف';

ALTER TABLE "WeightEntry" ADD COLUMN "groupBirdCount" INTEGER;
ALTER TABLE "WeightEntry" ADD COLUMN "groupTotalWeightKg" DECIMAL(10,2);
