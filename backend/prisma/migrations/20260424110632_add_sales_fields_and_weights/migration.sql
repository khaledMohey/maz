/*
  Warnings:

  - Added the required column `emptyWeight` to the `SaleWeightEntry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fullWeight` to the `SaleWeightEntry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `netWeight` to the `SaleWeightEntry` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "broker" TEXT,
ADD COLUMN     "paidAmount" DECIMAL(12,2) DEFAULT 0,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "pricePerKg" DECIMAL(12,2),
ADD COLUMN     "remainingAmount" DECIMAL(12,2),
ADD COLUMN     "totalNetWeight" DECIMAL(12,2),
ADD COLUMN     "trader" TEXT;

-- AlterTable
ALTER TABLE "SaleWeightEntry" ADD COLUMN     "cages" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "emptyWeight" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "fullWeight" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "netWeight" DECIMAL(12,2) NOT NULL;
