-- CreateEnum
CREATE TYPE "PartnerShareType" AS ENUM ('PERCENT', 'FIXED');

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shareType" "PartnerShareType" NOT NULL,
    "shareValue" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Partner_farmId_idx" ON "Partner"("farmId");

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
