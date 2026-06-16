-- CreateTable
CREATE TABLE "ChickArrival" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "arrivalDate" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChickArrival_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChickArrival_cycleId_arrivalDate_idx" ON "ChickArrival"("cycleId", "arrivalDate");

-- AddForeignKey
ALTER TABLE "ChickArrival" ADD CONSTRAINT "ChickArrival_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
