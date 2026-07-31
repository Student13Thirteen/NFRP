-- AddEnum
CREATE TYPE "LeaseContractStatus" AS ENUM ('PENDING', 'ACTIVE', 'CLOSED', 'CANCELLED');

-- AddEnum
CREATE TYPE "LeaseInstallmentKind" AS ENUM ('ADVANCE', 'REGULAR', 'BUYOUT');

-- AlterTable
ALTER TABLE "ExpenseDocument" ADD COLUMN "leaseContractId" TEXT;

-- CreateTable
CREATE TABLE "LeaseContract" (
    "id" TEXT NOT NULL,
    "status" "LeaseContractStatus" NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL DEFAULT 'IMPORT',
    "importKey" TEXT,
    "lessorId" TEXT,
    "lessorName" TEXT,
    "vehicleSupplierName" TEXT,
    "contractNumber" TEXT,
    "contractDate" DATE,
    "startDate" DATE,
    "durationMonths" INTEGER,
    "installmentCount" INTEGER,
    "recurringInstallmentCount" INTEGER,
    "frequencyMonths" INTEGER NOT NULL DEFAULT 1,
    "advancePaymentNetCents" INTEGER,
    "recurringPaymentNetCents" INTEGER,
    "totalInstallmentsNetCents" INTEGER,
    "purchasePriceNetCents" INTEGER,
    "buyoutNetCents" INTEGER,
    "vatRatePercent" INTEGER NOT NULL DEFAULT 22,
    "tanBasisPoints" INTEGER,
    "leaseRateBasisPoints" INTEGER,
    "tractorId" TEXT,
    "trailerId" TEXT,
    "reviewReasons" TEXT,
    "notes" TEXT,
    "extractedText" TEXT,
    "filePath" TEXT,
    "originalFileName" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaseContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseInstallment" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "LeaseInstallmentKind" NOT NULL,
    "dueDate" DATE NOT NULL,
    "netAmountCents" INTEGER NOT NULL,
    "vatRatePercent" INTEGER NOT NULL DEFAULT 22,
    "vatCents" INTEGER NOT NULL,
    "grossAmountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaseInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaseContract_importKey_key" ON "LeaseContract"("importKey");

-- CreateIndex
CREATE INDEX "LeaseContract_status_idx" ON "LeaseContract"("status");

-- CreateIndex
CREATE INDEX "LeaseContract_contractDate_idx" ON "LeaseContract"("contractDate");

-- CreateIndex
CREATE INDEX "LeaseContract_startDate_idx" ON "LeaseContract"("startDate");

-- CreateIndex
CREATE INDEX "LeaseContract_lessorId_idx" ON "LeaseContract"("lessorId");

-- CreateIndex
CREATE INDEX "LeaseContract_contractNumber_idx" ON "LeaseContract"("contractNumber");

-- CreateIndex
CREATE INDEX "LeaseContract_tractorId_idx" ON "LeaseContract"("tractorId");

-- CreateIndex
CREATE INDEX "LeaseContract_trailerId_idx" ON "LeaseContract"("trailerId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaseInstallment_contractId_position_key" ON "LeaseInstallment"("contractId", "position");

-- CreateIndex
CREATE INDEX "LeaseInstallment_dueDate_idx" ON "LeaseInstallment"("dueDate");

-- CreateIndex
CREATE INDEX "LeaseInstallment_kind_idx" ON "LeaseInstallment"("kind");

-- CreateIndex
CREATE INDEX "ExpenseDocument_leaseContractId_idx" ON "ExpenseDocument"("leaseContractId");

-- AddForeignKey
ALTER TABLE "ExpenseDocument" ADD CONSTRAINT "ExpenseDocument_leaseContractId_fkey" FOREIGN KEY ("leaseContractId") REFERENCES "LeaseContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseContract" ADD CONSTRAINT "LeaseContract_lessorId_fkey" FOREIGN KEY ("lessorId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseContract" ADD CONSTRAINT "LeaseContract_tractorId_fkey" FOREIGN KEY ("tractorId") REFERENCES "Tractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseContract" ADD CONSTRAINT "LeaseContract_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "Trailer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseInstallment" ADD CONSTRAINT "LeaseInstallment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "LeaseContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
