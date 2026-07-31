CREATE TYPE "TripStatus" AS ENUM ('PLANNED', 'SENT', 'COMPLETED', 'CANCELLED');

CREATE TABLE "LoadingBase" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoadingBase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesPoint" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "plantCode" TEXT,
  "address" TEXT,
  "city" TEXT,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesPoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Trip" (
  "id" TEXT NOT NULL,
  "tripNumber" SERIAL NOT NULL,
  "tripDate" TIMESTAMP(3) NOT NULL,
  "status" "TripStatus" NOT NULL DEFAULT 'PLANNED',
  "sequenceNumber" INTEGER,
  "expectedKm" INTEGER,
  "loadingBaseId" TEXT NOT NULL,
  "salesPointId" TEXT NOT NULL,
  "driverId" TEXT,
  "tractorId" TEXT,
  "trailerId" TEXT,
  "gasolineLiters" INTEGER NOT NULL DEFAULT 0,
  "dieselLiters" INTEGER NOT NULL DEFAULT 0,
  "gplLiters" INTEGER NOT NULL DEFAULT 0,
  "jetLiters" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoadingBase_name_key" ON "LoadingBase"("name");
CREATE INDEX "LoadingBase_active_name_idx" ON "LoadingBase"("active", "name");
CREATE UNIQUE INDEX "SalesPoint_name_plantCode_key" ON "SalesPoint"("name", "plantCode");
CREATE INDEX "SalesPoint_active_name_idx" ON "SalesPoint"("active", "name");
CREATE INDEX "SalesPoint_plantCode_idx" ON "SalesPoint"("plantCode");
CREATE UNIQUE INDEX "Trip_tripNumber_key" ON "Trip"("tripNumber");
CREATE INDEX "Trip_tripDate_idx" ON "Trip"("tripDate");
CREATE INDEX "Trip_status_idx" ON "Trip"("status");
CREATE INDEX "Trip_loadingBaseId_idx" ON "Trip"("loadingBaseId");
CREATE INDEX "Trip_salesPointId_idx" ON "Trip"("salesPointId");
CREATE INDEX "Trip_driverId_idx" ON "Trip"("driverId");
CREATE INDEX "Trip_tractorId_idx" ON "Trip"("tractorId");
CREATE INDEX "Trip_trailerId_idx" ON "Trip"("trailerId");

ALTER TABLE "Trip" ADD CONSTRAINT "Trip_loadingBaseId_fkey" FOREIGN KEY ("loadingBaseId") REFERENCES "LoadingBase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_salesPointId_fkey" FOREIGN KEY ("salesPointId") REFERENCES "SalesPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_tractorId_fkey" FOREIGN KEY ("tractorId") REFERENCES "Tractor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "Trailer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
