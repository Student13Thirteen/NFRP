-- CreateEnum
CREATE TYPE "FuelEntryStatus" AS ENUM ('OK', 'NEEDS_REVIEW', 'VERIFIED');

-- AlterTable
ALTER TABLE "Tractor" ADD COLUMN "assignedDriverId" TEXT;

-- AlterTable
ALTER TABLE "Trailer" ADD COLUMN "assignedTractorId" TEXT;

-- CreateTable
CREATE TABLE "FuelImportBatch" (
    "id" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fuelSupplierId" TEXT,
    "supplierName" TEXT,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "periodEndDate" TIMESTAMP(3),
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "totalVolumeLitersMilli" INTEGER NOT NULL DEFAULT 0,
    "totalAmountCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelSupplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelCard" (
    "id" TEXT NOT NULL,
    "fuelSupplierId" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "label" TEXT,
    "assignedTractorId" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelEntry" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "importBatchId" TEXT,
    "fuelDate" TIMESTAMP(3) NOT NULL,
    "fuelTime" TEXT,
    "fuelSupplierId" TEXT,
    "fuelCardId" TEXT,
    "supplierName" TEXT,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "manualEntry" BOOLEAN NOT NULL DEFAULT false,
    "cardNumber" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "productName" TEXT,
    "plate" TEXT NOT NULL,
    "tractorId" TEXT,
    "driverId" TEXT,
    "odometerKm" INTEGER,
    "stationCode" TEXT,
    "stationName" TEXT,
    "serviceType" TEXT,
    "amountCents" INTEGER,
    "totalAmountCents" INTEGER NOT NULL,
    "volumeLitersMilli" INTEGER NOT NULL,
    "finalPricePerLiterMilliEuro" INTEGER,
    "grossPricePerLiterMilliEuro" INTEGER,
    "basePricePerLiterMilliEuro" INTEGER,
    "discountPerLiterMilliEuro" INTEGER,
    "kmDelta" INTEGER,
    "litersPer100KmTenths" INTEGER,
    "costPerKmMilliEuro" INTEGER,
    "status" "FuelEntryStatus" NOT NULL DEFAULT 'OK',
    "reviewReasons" TEXT,
    "manuallyVerified" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "rawText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FuelImportBatch_invoiceDate_idx" ON "FuelImportBatch"("invoiceDate");

-- CreateIndex
CREATE INDEX "FuelImportBatch_invoiceNumber_idx" ON "FuelImportBatch"("invoiceNumber");

-- CreateIndex
CREATE INDEX "FuelImportBatch_fuelSupplierId_idx" ON "FuelImportBatch"("fuelSupplierId");

-- CreateIndex
CREATE INDEX "FuelImportBatch_createdAt_idx" ON "FuelImportBatch"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FuelSupplier_name_key" ON "FuelSupplier"("name");

-- CreateIndex
CREATE INDEX "FuelSupplier_active_name_idx" ON "FuelSupplier"("active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FuelCard_fuelSupplierId_cardNumber_key" ON "FuelCard"("fuelSupplierId", "cardNumber");

-- CreateIndex
CREATE INDEX "FuelCard_active_cardNumber_idx" ON "FuelCard"("active", "cardNumber");

-- CreateIndex
CREATE INDEX "FuelCard_fuelSupplierId_idx" ON "FuelCard"("fuelSupplierId");

-- CreateIndex
CREATE INDEX "FuelCard_assignedTractorId_idx" ON "FuelCard"("assignedTractorId");

-- CreateIndex
CREATE INDEX "Tractor_assignedDriverId_idx" ON "Tractor"("assignedDriverId");

-- CreateIndex
CREATE INDEX "Trailer_assignedTractorId_idx" ON "Trailer"("assignedTractorId");

-- CreateIndex
CREATE UNIQUE INDEX "FuelEntry_sourceKey_key" ON "FuelEntry"("sourceKey");

-- CreateIndex
CREATE INDEX "FuelEntry_fuelDate_idx" ON "FuelEntry"("fuelDate");

-- CreateIndex
CREATE INDEX "FuelEntry_plate_idx" ON "FuelEntry"("plate");

-- CreateIndex
CREATE INDEX "FuelEntry_tractorId_idx" ON "FuelEntry"("tractorId");

-- CreateIndex
CREATE INDEX "FuelEntry_driverId_idx" ON "FuelEntry"("driverId");

-- CreateIndex
CREATE INDEX "FuelEntry_fuelSupplierId_idx" ON "FuelEntry"("fuelSupplierId");

-- CreateIndex
CREATE INDEX "FuelEntry_fuelCardId_idx" ON "FuelEntry"("fuelCardId");

-- CreateIndex
CREATE INDEX "FuelEntry_status_idx" ON "FuelEntry"("status");

-- CreateIndex
CREATE INDEX "FuelEntry_productCode_idx" ON "FuelEntry"("productCode");

-- CreateIndex
CREATE INDEX "FuelEntry_invoiceNumber_idx" ON "FuelEntry"("invoiceNumber");

-- CreateIndex
CREATE INDEX "FuelEntry_importBatchId_idx" ON "FuelEntry"("importBatchId");

-- AddForeignKey
ALTER TABLE "Tractor" ADD CONSTRAINT "Tractor_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trailer" ADD CONSTRAINT "Trailer_assignedTractorId_fkey" FOREIGN KEY ("assignedTractorId") REFERENCES "Tractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelImportBatch" ADD CONSTRAINT "FuelImportBatch_fuelSupplierId_fkey" FOREIGN KEY ("fuelSupplierId") REFERENCES "FuelSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelCard" ADD CONSTRAINT "FuelCard_fuelSupplierId_fkey" FOREIGN KEY ("fuelSupplierId") REFERENCES "FuelSupplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelCard" ADD CONSTRAINT "FuelCard_assignedTractorId_fkey" FOREIGN KEY ("assignedTractorId") REFERENCES "Tractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelEntry" ADD CONSTRAINT "FuelEntry_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "FuelImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelEntry" ADD CONSTRAINT "FuelEntry_fuelSupplierId_fkey" FOREIGN KEY ("fuelSupplierId") REFERENCES "FuelSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelEntry" ADD CONSTRAINT "FuelEntry_fuelCardId_fkey" FOREIGN KEY ("fuelCardId") REFERENCES "FuelCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelEntry" ADD CONSTRAINT "FuelEntry_tractorId_fkey" FOREIGN KEY ("tractorId") REFERENCES "Tractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelEntry" ADD CONSTRAINT "FuelEntry_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
