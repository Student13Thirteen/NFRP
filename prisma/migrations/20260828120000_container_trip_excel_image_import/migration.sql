ALTER TABLE "ContainerTrip"
  ADD COLUMN "routeSequence" TEXT,
  ADD COLUMN "returnBaseName" TEXT,
  ADD COLUMN "additionalCostType" TEXT,
  ADD COLUMN "additionalCostCents" INTEGER;

ALTER TABLE "ContainerTripContainer"
  ADD COLUMN "specification" TEXT;

ALTER TABLE "TripImportBatch"
  ADD COLUMN "contentHash" TEXT;

CREATE UNIQUE INDEX "TripImportBatch_contentHash_key"
  ON "TripImportBatch"("contentHash");
