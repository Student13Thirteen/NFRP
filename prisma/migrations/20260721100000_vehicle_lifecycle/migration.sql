CREATE TYPE "VehicleLifecycleStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SOLD', 'SCRAPPED');

ALTER TABLE "Tractor"
  ADD COLUMN "lifecycleStatus" "VehicleLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "lifecycleEndedAt" DATE;

ALTER TABLE "Trailer"
  ADD COLUMN "lifecycleStatus" "VehicleLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "lifecycleEndedAt" DATE;

UPDATE "Tractor"
SET "lifecycleStatus" = 'INACTIVE'
WHERE "active" = false;

UPDATE "Trailer"
SET "lifecycleStatus" = 'INACTIVE'
WHERE "active" = false;

CREATE INDEX "Tractor_lifecycleStatus_idx" ON "Tractor"("lifecycleStatus");
CREATE INDEX "Trailer_lifecycleStatus_idx" ON "Trailer"("lifecycleStatus");
