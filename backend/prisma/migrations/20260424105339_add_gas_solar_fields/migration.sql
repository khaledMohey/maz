-- AlterTable
ALTER TABLE "Gas" ADD COLUMN     "cost" DECIMAL(12,2),
ADD COLUMN     "count" INTEGER DEFAULT 0,
ADD COLUMN     "gasType" TEXT DEFAULT 'كبير';

-- AlterTable
ALTER TABLE "Solar" ADD COLUMN     "cost" DECIMAL(12,2),
ADD COLUMN     "liters" DECIMAL(12,2);
