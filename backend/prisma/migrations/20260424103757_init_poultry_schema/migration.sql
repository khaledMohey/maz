-- CreateTable
CREATE TABLE "Farm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Farm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cycle" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "initialBirds" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mortality" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mortality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feed" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "feedType" TEXT NOT NULL,
    "quantityKg" DECIMAL(10,2) NOT NULL,
    "unitPrice" DECIMAL(10,2),
    "totalCost" DECIMAL(12,2),
    "supplier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gas" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'cylinder',
    "unitPrice" DECIMAL(10,2),
    "totalCost" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Solar" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kwhGenerated" DECIMAL(12,2),
    "maintenanceCost" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Solar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medication" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "dosage" TEXT,
    "quantity" DECIMAL(10,2),
    "unitPrice" DECIMAL(10,2),
    "totalCost" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Medication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT,
    "hiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerExpense" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "customerName" TEXT,
    "invoiceNumber" TEXT,
    "totalAmount" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleWeightEntry" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "weightKg" DECIMAL(10,2) NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "birdCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleWeightEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyConsumption" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "feedKg" DECIMAL(10,2),
    "waterLiters" DECIMAL(12,2),
    "gasUsed" DECIMAL(10,2),
    "electricityKwh" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cycle_farmId_idx" ON "Cycle"("farmId");

-- CreateIndex
CREATE INDEX "Mortality_cycleId_date_idx" ON "Mortality"("cycleId", "date");

-- CreateIndex
CREATE INDEX "Feed_cycleId_date_idx" ON "Feed"("cycleId", "date");

-- CreateIndex
CREATE INDEX "Gas_cycleId_date_idx" ON "Gas"("cycleId", "date");

-- CreateIndex
CREATE INDEX "Solar_cycleId_date_idx" ON "Solar"("cycleId", "date");

-- CreateIndex
CREATE INDEX "Expense_cycleId_date_idx" ON "Expense"("cycleId", "date");

-- CreateIndex
CREATE INDEX "Medication_cycleId_date_idx" ON "Medication"("cycleId", "date");

-- CreateIndex
CREATE INDEX "Worker_cycleId_idx" ON "Worker"("cycleId");

-- CreateIndex
CREATE INDEX "WorkerExpense_cycleId_date_idx" ON "WorkerExpense"("cycleId", "date");

-- CreateIndex
CREATE INDEX "WorkerExpense_workerId_idx" ON "WorkerExpense"("workerId");

-- CreateIndex
CREATE INDEX "Sale_cycleId_date_idx" ON "Sale"("cycleId", "date");

-- CreateIndex
CREATE INDEX "SaleWeightEntry_cycleId_idx" ON "SaleWeightEntry"("cycleId");

-- CreateIndex
CREATE INDEX "SaleWeightEntry_saleId_idx" ON "SaleWeightEntry"("saleId");

-- CreateIndex
CREATE INDEX "DailyConsumption_cycleId_date_idx" ON "DailyConsumption"("cycleId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyConsumption_cycleId_date_key" ON "DailyConsumption"("cycleId", "date");

-- AddForeignKey
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mortality" ADD CONSTRAINT "Mortality_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feed" ADD CONSTRAINT "Feed_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gas" ADD CONSTRAINT "Gas_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Solar" ADD CONSTRAINT "Solar_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medication" ADD CONSTRAINT "Medication_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerExpense" ADD CONSTRAINT "WorkerExpense_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerExpense" ADD CONSTRAINT "WorkerExpense_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleWeightEntry" ADD CONSTRAINT "SaleWeightEntry_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleWeightEntry" ADD CONSTRAINT "SaleWeightEntry_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyConsumption" ADD CONSTRAINT "DailyConsumption_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
