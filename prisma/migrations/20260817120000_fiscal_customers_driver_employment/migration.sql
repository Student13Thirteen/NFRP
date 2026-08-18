CREATE TYPE "DriverEmploymentEndReason" AS ENUM (
  'RESIGNATION',
  'DISMISSAL',
  'PROBATION_FAILED',
  'CONTRACT_ENDED',
  'OTHER'
);

ALTER TABLE "ContainerCustomer"
  ADD COLUMN "taxCode" TEXT,
  ADD COLUMN "pecEmail" TEXT;

ALTER TABLE "Supplier"
  ADD COLUMN "vatNumber" TEXT,
  ADD COLUMN "taxCode" TEXT,
  ADD COLUMN "pecEmail" TEXT;

CREATE TABLE "DriverEmploymentPeriod" (
  "id" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE,
  "endReason" "DriverEmploymentEndReason",
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DriverEmploymentPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DriverEmploymentPeriod_date_order_check" CHECK ("endDate" IS NULL OR "endDate" >= "startDate"),
  CONSTRAINT "DriverEmploymentPeriod_end_reason_check" CHECK (
    ("endDate" IS NULL AND "endReason" IS NULL)
    OR ("endDate" IS NOT NULL AND "endReason" IS NOT NULL)
  )
);

CREATE INDEX "DriverEmploymentPeriod_driverId_startDate_endDate_idx"
  ON "DriverEmploymentPeriod"("driverId", "startDate", "endDate");

ALTER TABLE "DriverEmploymentPeriod"
  ADD CONSTRAINT "DriverEmploymentPeriod_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "DocumentType" (
  "id",
  "name",
  "suggestedEntityType",
  "defaultNoticeDays",
  "expiryRequired",
  "active",
  "createdAt",
  "updatedAt"
)
VALUES (
  'driver-port-badge',
  'Badge portuale',
  'DRIVER',
  30,
  TRUE,
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO UPDATE SET
  "suggestedEntityType" = 'DRIVER',
  "expiryRequired" = TRUE,
  "active" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP;
