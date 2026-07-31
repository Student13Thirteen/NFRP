CREATE TYPE "TollEntryStatus" AS ENUM ('PENDING', 'OK', 'NEEDS_REVIEW', 'VERIFIED');

CREATE TABLE "TollImportBatch" (
    "id" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "providerName" TEXT NOT NULL DEFAULT 'Autostrade',
    "customerCode" TEXT,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "totalNetCents" INTEGER NOT NULL DEFAULT 0,
    "totalVatCents" INTEGER NOT NULL DEFAULT 0,
    "totalGrossCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TollImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TollCard" (
    "id" TEXT NOT NULL,
    "providerName" TEXT NOT NULL DEFAULT 'Autostrade',
    "cardNumber" TEXT NOT NULL,
    "label" TEXT,
    "assignedTractorId" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TollCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TollEntry" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "importBatchId" TEXT,
    "status" "TollEntryStatus" NOT NULL DEFAULT 'PENDING',
    "reviewReasons" TEXT,
    "tollDate" TIMESTAMP(3) NOT NULL,
    "tollTime" TEXT,
    "entryDate" TIMESTAMP(3),
    "entryTime" TEXT,
    "providerName" TEXT NOT NULL DEFAULT 'Autostrade',
    "customerCode" TEXT,
    "invoiceNumber" TEXT,
    "cardId" TEXT,
    "cardNumber" TEXT NOT NULL,
    "supportType" TEXT,
    "rowCounter" INTEGER,
    "movementType" TEXT,
    "motorwayCode" TEXT,
    "motorwayName" TEXT,
    "entryGateCode" TEXT,
    "entryGateName" TEXT,
    "exitGateCode" TEXT,
    "exitGateName" TEXT,
    "routeName" TEXT NOT NULL,
    "netAmountCents" INTEGER NOT NULL DEFAULT 0,
    "grossAmountCents" INTEGER NOT NULL DEFAULT 0,
    "vatAmountCents" INTEGER NOT NULL DEFAULT 0,
    "vatRatePercent" INTEGER,
    "exemptDiscountCents" INTEGER,
    "taxableGrossDiscountCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "vehicleClass" TEXT,
    "plateCountry" TEXT,
    "plate" TEXT NOT NULL,
    "tractorId" TEXT,
    "secondaryPlateCountry" TEXT,
    "secondaryPlate" TEXT,
    "secondaryEuroClass" TEXT,
    "euroClass" TEXT,
    "authorizationCode" TEXT,
    "distanceKm" INTEGER,
    "country" TEXT,
    "rawText" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TollEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TollImportBatch_invoiceDate_idx" ON "TollImportBatch"("invoiceDate");
CREATE INDEX "TollImportBatch_invoiceNumber_idx" ON "TollImportBatch"("invoiceNumber");
CREATE INDEX "TollImportBatch_providerName_idx" ON "TollImportBatch"("providerName");
CREATE INDEX "TollImportBatch_createdAt_idx" ON "TollImportBatch"("createdAt");

CREATE UNIQUE INDEX "TollCard_providerName_cardNumber_key" ON "TollCard"("providerName", "cardNumber");
CREATE INDEX "TollCard_active_cardNumber_idx" ON "TollCard"("active", "cardNumber");
CREATE INDEX "TollCard_providerName_idx" ON "TollCard"("providerName");
CREATE INDEX "TollCard_assignedTractorId_idx" ON "TollCard"("assignedTractorId");

CREATE UNIQUE INDEX "TollEntry_sourceKey_key" ON "TollEntry"("sourceKey");
CREATE INDEX "TollEntry_tollDate_idx" ON "TollEntry"("tollDate");
CREATE INDEX "TollEntry_plate_idx" ON "TollEntry"("plate");
CREATE INDEX "TollEntry_tractorId_idx" ON "TollEntry"("tractorId");
CREATE INDEX "TollEntry_cardId_idx" ON "TollEntry"("cardId");
CREATE INDEX "TollEntry_cardNumber_idx" ON "TollEntry"("cardNumber");
CREATE INDEX "TollEntry_status_idx" ON "TollEntry"("status");
CREATE INDEX "TollEntry_invoiceNumber_idx" ON "TollEntry"("invoiceNumber");
CREATE INDEX "TollEntry_importBatchId_idx" ON "TollEntry"("importBatchId");

ALTER TABLE "TollCard" ADD CONSTRAINT "TollCard_assignedTractorId_fkey" FOREIGN KEY ("assignedTractorId") REFERENCES "Tractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TollEntry" ADD CONSTRAINT "TollEntry_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "TollImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TollEntry" ADD CONSTRAINT "TollEntry_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "TollCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TollEntry" ADD CONSTRAINT "TollEntry_tractorId_fkey" FOREIGN KEY ("tractorId") REFERENCES "Tractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
