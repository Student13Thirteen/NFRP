CREATE TYPE "TripBillingStatus" AS ENUM ('NOT_READY', 'TO_BILL', 'INVOICED', 'PAID', 'NOT_BILLABLE');

ALTER TABLE "Trip"
  ADD COLUMN "billingStatus" "TripBillingStatus" NOT NULL DEFAULT 'NOT_READY',
  ADD COLUMN "odometerStartKm" INTEGER,
  ADD COLUMN "odometerEndKm" INTEGER,
  ADD COLUMN "customerName" TEXT,
  ADD COLUMN "customerReference" TEXT,
  ADD COLUMN "carrierName" TEXT,
  ADD COLUMN "transportDocumentNumber" TEXT,
  ADD COLUMN "transportDocumentDate" TIMESTAMP(3),
  ADD COLUMN "invoiceNumber" TEXT,
  ADD COLUMN "invoiceDate" TIMESTAMP(3),
  ADD COLUMN "freightRevenueCents" INTEGER,
  ADD COLUMN "carrierCostCents" INTEGER,
  ADD COLUMN "tollCostCents" INTEGER,
  ADD COLUMN "extraCostCents" INTEGER,
  ADD COLUMN "economicNotes" TEXT;

CREATE INDEX "Trip_billingStatus_idx" ON "Trip"("billingStatus");
CREATE INDEX "Trip_customerName_idx" ON "Trip"("customerName");
CREATE INDEX "Trip_invoiceNumber_idx" ON "Trip"("invoiceNumber");
