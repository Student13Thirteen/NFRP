-- CreateEnum
CREATE TYPE "TripImportRowStatus" AS ENUM ('PENDING', 'IMPORTED', 'DISCARDED');

-- AlterTable
ALTER TABLE "TripProduct" ADD COLUMN "unitLabel" TEXT NOT NULL DEFAULT 'L';

-- CreateTable
CREATE TABLE "TripCustomer" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "vatNumber" TEXT,
    "address" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "province" TEXT,
    "country" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripCustomer_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN "customerId" TEXT;

-- CreateTable
CREATE TABLE "TripImportBatch" (
    "id" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extractedText" TEXT,
    "extractionStatus" TEXT,
    "parsedRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "createdDrivers" INTEGER NOT NULL DEFAULT 0,
    "createdTractors" INTEGER NOT NULL DEFAULT 0,
    "createdTrailers" INTEGER NOT NULL DEFAULT 0,
    "createdCustomers" INTEGER NOT NULL DEFAULT 0,
    "createdLocations" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripImportRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "status" "TripImportRowStatus" NOT NULL DEFAULT 'PENDING',
    "sourceKey" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL DEFAULT 0,
    "pageNumber" INTEGER,
    "documentFormat" TEXT,
    "documentNumber" TEXT,
    "documentDate" TIMESTAMP(3),
    "tripDate" TIMESTAMP(3),
    "driverName" TEXT,
    "driverId" TEXT,
    "tractorPlate" TEXT,
    "tractorId" TEXT,
    "trailerPlate" TEXT,
    "trailerId" TEXT,
    "carrierName" TEXT,
    "customerCode" TEXT,
    "customerName" TEXT,
    "customerId" TEXT,
    "loadingBaseName" TEXT,
    "loadingBaseId" TEXT,
    "deliveryName" TEXT,
    "deliveryAddress" TEXT,
    "deliveryCity" TEXT,
    "deliveryProvince" TEXT,
    "salesPointId" TEXT,
    "container1" TEXT,
    "container1Type" TEXT,
    "seal1" TEXT,
    "container2" TEXT,
    "container2Type" TEXT,
    "seal2" TEXT,
    "booking" TEXT,
    "ship" TEXT,
    "pickupCode" TEXT,
    "deliveryCode" TEXT,
    "companyReference" TEXT,
    "forwarder" TEXT,
    "compilerName" TEXT,
    "compilationPlace" TEXT,
    "reviewReasons" TEXT,
    "rawText" TEXT,
    "tripId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TripCustomer_code_key" ON "TripCustomer"("code");

-- CreateIndex
CREATE INDEX "TripCustomer_active_name_idx" ON "TripCustomer"("active", "name");

-- CreateIndex
CREATE INDEX "TripCustomer_code_idx" ON "TripCustomer"("code");

-- CreateIndex
CREATE INDEX "Trip_customerId_idx" ON "Trip"("customerId");

-- CreateIndex
CREATE INDEX "TripImportBatch_createdAt_idx" ON "TripImportBatch"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TripImportRow_sourceKey_key" ON "TripImportRow"("sourceKey");

-- CreateIndex
CREATE INDEX "TripImportRow_status_createdAt_idx" ON "TripImportRow"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TripImportRow_batchId_idx" ON "TripImportRow"("batchId");

-- CreateIndex
CREATE INDEX "TripImportRow_tripDate_idx" ON "TripImportRow"("tripDate");

-- CreateIndex
CREATE INDEX "TripImportRow_documentNumber_idx" ON "TripImportRow"("documentNumber");

-- CreateIndex
CREATE INDEX "TripImportRow_driverId_idx" ON "TripImportRow"("driverId");

-- CreateIndex
CREATE INDEX "TripImportRow_tractorId_idx" ON "TripImportRow"("tractorId");

-- CreateIndex
CREATE INDEX "TripImportRow_trailerId_idx" ON "TripImportRow"("trailerId");

-- CreateIndex
CREATE INDEX "TripImportRow_customerId_idx" ON "TripImportRow"("customerId");

-- CreateIndex
CREATE INDEX "TripImportRow_loadingBaseId_idx" ON "TripImportRow"("loadingBaseId");

-- CreateIndex
CREATE INDEX "TripImportRow_salesPointId_idx" ON "TripImportRow"("salesPointId");

-- CreateIndex
CREATE INDEX "TripImportRow_tripId_idx" ON "TripImportRow"("tripId");

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "TripCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripImportRow" ADD CONSTRAINT "TripImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TripImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripImportRow" ADD CONSTRAINT "TripImportRow_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripImportRow" ADD CONSTRAINT "TripImportRow_tractorId_fkey" FOREIGN KEY ("tractorId") REFERENCES "Tractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripImportRow" ADD CONSTRAINT "TripImportRow_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "Trailer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripImportRow" ADD CONSTRAINT "TripImportRow_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "TripCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripImportRow" ADD CONSTRAINT "TripImportRow_loadingBaseId_fkey" FOREIGN KEY ("loadingBaseId") REFERENCES "LoadingBase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripImportRow" ADD CONSTRAINT "TripImportRow_salesPointId_fkey" FOREIGN KEY ("salesPointId") REFERENCES "SalesPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripImportRow" ADD CONSTRAINT "TripImportRow_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
