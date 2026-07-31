-- Documenti di spesa a righe (manutenzioni/ricambi) con IVA per riga e allocazione
-- targa/magazzino/azienda, piu movimenti di magazzino (carico/scarico/rettifica).
-- Tutto additivo: Maintenance e WarehouseItem restano, nessun dato perso.

-- CreateEnum
CREATE TYPE "ExpenseDocumentStatus" AS ENUM ('PENDING', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "ExpenseAllocationType" AS ENUM ('TRACTOR', 'TRAILER', 'WAREHOUSE', 'GENERIC');

-- CreateEnum
CREATE TYPE "WarehouseMovementType" AS ENUM ('LOAD', 'UNLOAD', 'ADJUST');

-- AlterTable
ALTER TABLE "Maintenance" ADD COLUMN "migratedToExpense" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WarehouseItem" ADD COLUMN "unitCostCents" INTEGER;
ALTER TABLE "WarehouseItem" ADD COLUMN "vatRatePercent" INTEGER;
ALTER TABLE "WarehouseItem" ADD COLUMN "sourceExpenseLineId" TEXT;
ALTER TABLE "WarehouseItem" ADD COLUMN "migratedToExpense" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ExpenseDocument" (
    "id" TEXT NOT NULL,
    "status" "ExpenseDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "supplierId" TEXT,
    "supplierName" TEXT,
    "documentNumber" TEXT,
    "documentDate" TIMESTAMP(3),
    "registeredAt" TIMESTAMP(3) NOT NULL,
    "totalImponibileCents" INTEGER NOT NULL DEFAULT 0,
    "totalVatCents" INTEGER NOT NULL DEFAULT 0,
    "totalAmountCents" INTEGER NOT NULL DEFAULT 0,
    "reviewReasons" TEXT,
    "notes" TEXT,
    "filePath" TEXT,
    "originalFileName" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseLine" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "code" TEXT,
    "description" TEXT NOT NULL,
    "quantityMilli" INTEGER NOT NULL DEFAULT 1000,
    "unit" TEXT NOT NULL DEFAULT 'pz',
    "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
    "imponibileCents" INTEGER NOT NULL DEFAULT 0,
    "vatRatePercent" INTEGER NOT NULL DEFAULT 22,
    "vatCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "categoryId" TEXT,
    "allocationType" "ExpenseAllocationType" NOT NULL DEFAULT 'GENERIC',
    "tractorId" TEXT,
    "trailerId" TEXT,
    "warehouseItemId" TEXT,
    "odometerKm" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseMovement" (
    "id" TEXT NOT NULL,
    "warehouseItemId" TEXT NOT NULL,
    "type" "WarehouseMovementType" NOT NULL,
    "quantityMilli" INTEGER NOT NULL,
    "unitCostCents" INTEGER,
    "amountCents" INTEGER,
    "movementDate" TIMESTAMP(3) NOT NULL,
    "tractorId" TEXT,
    "trailerId" TEXT,
    "sourceExpenseLineId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseDocument_status_idx" ON "ExpenseDocument"("status");

-- CreateIndex
CREATE INDEX "ExpenseDocument_documentDate_idx" ON "ExpenseDocument"("documentDate");

-- CreateIndex
CREATE INDEX "ExpenseDocument_registeredAt_idx" ON "ExpenseDocument"("registeredAt");

-- CreateIndex
CREATE INDEX "ExpenseDocument_supplierId_idx" ON "ExpenseDocument"("supplierId");

-- CreateIndex
CREATE INDEX "ExpenseDocument_createdAt_idx" ON "ExpenseDocument"("createdAt");

-- CreateIndex
CREATE INDEX "ExpenseLine_documentId_position_idx" ON "ExpenseLine"("documentId", "position");

-- CreateIndex
CREATE INDEX "ExpenseLine_allocationType_idx" ON "ExpenseLine"("allocationType");

-- CreateIndex
CREATE INDEX "ExpenseLine_tractorId_idx" ON "ExpenseLine"("tractorId");

-- CreateIndex
CREATE INDEX "ExpenseLine_trailerId_idx" ON "ExpenseLine"("trailerId");

-- CreateIndex
CREATE INDEX "ExpenseLine_warehouseItemId_idx" ON "ExpenseLine"("warehouseItemId");

-- CreateIndex
CREATE INDEX "ExpenseLine_categoryId_idx" ON "ExpenseLine"("categoryId");

-- CreateIndex
CREATE INDEX "WarehouseMovement_warehouseItemId_movementDate_idx" ON "WarehouseMovement"("warehouseItemId", "movementDate");

-- CreateIndex
CREATE INDEX "WarehouseMovement_type_idx" ON "WarehouseMovement"("type");

-- CreateIndex
CREATE INDEX "WarehouseMovement_tractorId_idx" ON "WarehouseMovement"("tractorId");

-- CreateIndex
CREATE INDEX "WarehouseMovement_trailerId_idx" ON "WarehouseMovement"("trailerId");

-- AddForeignKey
ALTER TABLE "ExpenseDocument" ADD CONSTRAINT "ExpenseDocument_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseLine" ADD CONSTRAINT "ExpenseLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ExpenseDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseLine" ADD CONSTRAINT "ExpenseLine_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseLine" ADD CONSTRAINT "ExpenseLine_tractorId_fkey" FOREIGN KEY ("tractorId") REFERENCES "Tractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseLine" ADD CONSTRAINT "ExpenseLine_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "Trailer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseLine" ADD CONSTRAINT "ExpenseLine_warehouseItemId_fkey" FOREIGN KEY ("warehouseItemId") REFERENCES "WarehouseItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseMovement" ADD CONSTRAINT "WarehouseMovement_warehouseItemId_fkey" FOREIGN KEY ("warehouseItemId") REFERENCES "WarehouseItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseMovement" ADD CONSTRAINT "WarehouseMovement_tractorId_fkey" FOREIGN KEY ("tractorId") REFERENCES "Tractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseMovement" ADD CONSTRAINT "WarehouseMovement_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "Trailer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
