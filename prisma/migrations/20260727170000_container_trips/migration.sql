CREATE TYPE "ContainerTripStatus" AS ENUM (
  'PLANNED',
  'IN_PROGRESS',
  'AWAITING_DRIVER_DATA',
  'UNDER_REVIEW',
  'READY_TO_BILL',
  'INVOICED',
  'CANCELLED'
);

CREATE TYPE "ContainerTripStopKind" AS ENUM (
  'PICKUP',
  'DELIVERY',
  'TERMINAL',
  'CUSTOMS',
  'OTHER'
);

CREATE TYPE "ContainerTripExtraKind" AS ENUM (
  'CUSTOMS',
  'WAITING',
  'STOP',
  'DETOUR',
  'HANDLING',
  'OTHER'
);

CREATE TYPE "ContainerTripExtraStatus" AS ENUM (
  'PROPOSED',
  'NEGOTIATED',
  'APPROVED',
  'REJECTED'
);

CREATE TABLE "ContainerCustomer" (
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
  CONSTRAINT "ContainerCustomer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContainerTrip" (
  "id" TEXT NOT NULL,
  "tripNumber" SERIAL NOT NULL,
  "tripDate" DATE NOT NULL,
  "status" "ContainerTripStatus" NOT NULL DEFAULT 'PLANNED',
  "billingStatus" "TripBillingStatus" NOT NULL DEFAULT 'NOT_READY',
  "waybillNumber" TEXT,
  "waybillDate" DATE,
  "customerId" TEXT,
  "customerCode" TEXT,
  "customerName" TEXT,
  "customerReference" TEXT,
  "carrierName" TEXT,
  "driverId" TEXT,
  "tractorId" TEXT,
  "trailerId" TEXT,
  "loadingTerminalName" TEXT,
  "deliveryTerminalName" TEXT,
  "booking" TEXT,
  "ship" TEXT,
  "pickupCode" TEXT,
  "deliveryCode" TEXT,
  "shippingCompany" TEXT,
  "forwarder" TEXT,
  "compilerName" TEXT,
  "compilationPlace" TEXT,
  "plannedKm" INTEGER,
  "odometerStartKm" INTEGER,
  "odometerEndKm" INTEGER,
  "actualKm" INTEGER,
  "distanceSource" TEXT,
  "driverReportedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "completionProofFilePath" TEXT,
  "completionProofFileName" TEXT,
  "completionProofMimeType" TEXT,
  "freightRevenueCents" INTEGER,
  "carrierCostCents" INTEGER,
  "tollCostCents" INTEGER,
  "economicNotes" TEXT,
  "notes" TEXT,
  "sourceType" TEXT,
  "externalRecordId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContainerTrip_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContainerTripContainer" (
  "id" TEXT NOT NULL,
  "containerTripId" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "containerNumber" TEXT,
  "containerType" TEXT,
  "sealNumber" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContainerTripContainer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContainerTripStop" (
  "id" TEXT NOT NULL,
  "containerTripId" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "kind" "ContainerTripStopKind" NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "postalCode" TEXT,
  "city" TEXT,
  "province" TEXT,
  "country" TEXT DEFAULT 'Italia',
  "plannedTime" TEXT,
  "arrivedAt" TIMESTAMP(3),
  "departedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContainerTripStop_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContainerExtraTariff" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "ContainerTripExtraKind" NOT NULL,
  "unitLabel" TEXT NOT NULL DEFAULT 'evento',
  "defaultUnitPriceCents" INTEGER NOT NULL,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContainerExtraTariff_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContainerTripExtra" (
  "id" TEXT NOT NULL,
  "containerTripId" TEXT NOT NULL,
  "tariffId" TEXT,
  "kind" "ContainerTripExtraKind" NOT NULL,
  "description" TEXT NOT NULL,
  "quantityMilli" INTEGER NOT NULL DEFAULT 1000,
  "unitLabel" TEXT NOT NULL DEFAULT 'evento',
  "proposedAmountCents" INTEGER,
  "negotiatedAmountCents" INTEGER,
  "approvedAmountCents" INTEGER,
  "status" "ContainerTripExtraStatus" NOT NULL DEFAULT 'PROPOSED',
  "reason" TEXT,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContainerTripExtra_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContainerTripExtraRevision" (
  "id" TEXT NOT NULL,
  "extraId" TEXT NOT NULL,
  "proposedAmountCents" INTEGER,
  "negotiatedAmountCents" INTEGER,
  "approvedAmountCents" INTEGER,
  "status" "ContainerTripExtraStatus" NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContainerTripExtraRevision_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TripImportRow"
  ADD COLUMN "containerTripId" TEXT,
  ADD COLUMN "loadingTerminalName" TEXT,
  ADD COLUMN "deliveryTerminalName" TEXT,
  ADD COLUMN "parsedStops" JSONB;

CREATE UNIQUE INDEX "ContainerCustomer_code_key" ON "ContainerCustomer"("code");
CREATE INDEX "ContainerCustomer_active_name_idx" ON "ContainerCustomer"("active", "name");
CREATE INDEX "ContainerCustomer_code_idx" ON "ContainerCustomer"("code");
CREATE UNIQUE INDEX "ContainerTrip_tripNumber_key" ON "ContainerTrip"("tripNumber");
CREATE UNIQUE INDEX "ContainerTrip_sourceType_externalRecordId_key" ON "ContainerTrip"("sourceType", "externalRecordId");
CREATE INDEX "ContainerTrip_tripDate_idx" ON "ContainerTrip"("tripDate");
CREATE INDEX "ContainerTrip_status_idx" ON "ContainerTrip"("status");
CREATE INDEX "ContainerTrip_billingStatus_idx" ON "ContainerTrip"("billingStatus");
CREATE INDEX "ContainerTrip_waybillNumber_idx" ON "ContainerTrip"("waybillNumber");
CREATE INDEX "ContainerTrip_customerId_idx" ON "ContainerTrip"("customerId");
CREATE INDEX "ContainerTrip_customerCode_idx" ON "ContainerTrip"("customerCode");
CREATE INDEX "ContainerTrip_customerName_idx" ON "ContainerTrip"("customerName");
CREATE INDEX "ContainerTrip_driverId_idx" ON "ContainerTrip"("driverId");
CREATE INDEX "ContainerTrip_tractorId_idx" ON "ContainerTrip"("tractorId");
CREATE INDEX "ContainerTrip_trailerId_idx" ON "ContainerTrip"("trailerId");

CREATE UNIQUE INDEX "ContainerTripContainer_containerTripId_position_key" ON "ContainerTripContainer"("containerTripId", "position");
CREATE INDEX "ContainerTripContainer_containerNumber_idx" ON "ContainerTripContainer"("containerNumber");

CREATE UNIQUE INDEX "ContainerTripStop_containerTripId_position_key" ON "ContainerTripStop"("containerTripId", "position");
CREATE INDEX "ContainerTripStop_kind_idx" ON "ContainerTripStop"("kind");
CREATE INDEX "ContainerTripStop_name_idx" ON "ContainerTripStop"("name");
CREATE INDEX "ContainerTripStop_city_idx" ON "ContainerTripStop"("city");

CREATE UNIQUE INDEX "ContainerExtraTariff_name_key" ON "ContainerExtraTariff"("name");
CREATE INDEX "ContainerExtraTariff_active_kind_idx" ON "ContainerExtraTariff"("active", "kind");

CREATE INDEX "ContainerTripExtra_containerTripId_status_idx" ON "ContainerTripExtra"("containerTripId", "status");
CREATE INDEX "ContainerTripExtra_tariffId_idx" ON "ContainerTripExtra"("tariffId");
CREATE INDEX "ContainerTripExtra_kind_idx" ON "ContainerTripExtra"("kind");
CREATE INDEX "ContainerTripExtraRevision_extraId_createdAt_idx" ON "ContainerTripExtraRevision"("extraId", "createdAt");
CREATE INDEX "TripImportRow_containerTripId_idx" ON "TripImportRow"("containerTripId");

ALTER TABLE "ContainerTrip"
  ADD CONSTRAINT "ContainerTrip_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "ContainerCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ContainerTrip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ContainerTrip_tractorId_fkey" FOREIGN KEY ("tractorId") REFERENCES "Tractor"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ContainerTrip_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "Trailer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContainerTripContainer"
  ADD CONSTRAINT "ContainerTripContainer_containerTripId_fkey" FOREIGN KEY ("containerTripId") REFERENCES "ContainerTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContainerTripStop"
  ADD CONSTRAINT "ContainerTripStop_containerTripId_fkey" FOREIGN KEY ("containerTripId") REFERENCES "ContainerTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContainerTripExtra"
  ADD CONSTRAINT "ContainerTripExtra_containerTripId_fkey" FOREIGN KEY ("containerTripId") REFERENCES "ContainerTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ContainerTripExtra_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "ContainerExtraTariff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContainerTripExtraRevision"
  ADD CONSTRAINT "ContainerTripExtraRevision_extraId_fkey" FOREIGN KEY ("extraId") REFERENCES "ContainerTripExtra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TripImportRow"
  ADD CONSTRAINT "TripImportRow_containerTripId_fkey" FOREIGN KEY ("containerTripId") REFERENCES "ContainerTrip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
