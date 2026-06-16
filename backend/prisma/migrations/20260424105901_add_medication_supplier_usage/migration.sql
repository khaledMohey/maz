-- AlterTable
ALTER TABLE "Medication" ADD COLUMN     "supplier" TEXT,
ADD COLUMN     "usedQuantity" DECIMAL(10,2) DEFAULT 0;
