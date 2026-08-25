-- Tipologie di flotta, proprietari di mezzi terzi e mezzi non aziendali.
-- Migrazione additiva: nessun record esistente viene riclassificato, nessun
-- costo o documento viene modificato.

-- 1) Tipologie mezzi. Restano nullable: i mezzi gia in anagrafica rimangono
-- "Da classificare" invece di ricevere una tipologia dedotta e non verificata.
CREATE TYPE "MotorVehicleType" AS ENUM ('TRACTOR_UNIT', 'RIGID_TRUCK', 'VAN', 'TRUCK', 'CAR');
CREATE TYPE "TrailerBodyType" AS ENUM ('CONTAINER', 'TANK', 'REEFER');
CREATE TYPE "TankCargoType" AS ENUM ('FUEL', 'LPG');

ALTER TABLE "Tractor" ADD COLUMN "vehicleType" "MotorVehicleType";
ALTER TABLE "Trailer" ADD COLUMN "bodyType" "TrailerBodyType";
ALTER TABLE "Trailer" ADD COLUMN "tankCargo" "TankCargoType";

-- Il carico si dichiara solo per le cisterne: un semirimorchio container o
-- frigo non puo conservare un residuo "benzina/gasolio" o "GPL".
ALTER TABLE "Trailer"
ADD CONSTRAINT "Trailer_tank_cargo_check"
CHECK ("tankCargo" IS NULL OR "bodyType" = 'TANK');

CREATE INDEX "Tractor_vehicleType_idx" ON "Tractor"("vehicleType");
CREATE INDEX "Trailer_bodyType_idx" ON "Trailer"("bodyType");

-- 2) Anagrafica proprietari di mezzi non aziendali.
CREATE TABLE "VehicleOwner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vatNumber" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleOwner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VehicleOwner_name_key" ON "VehicleOwner"("name");
CREATE INDEX "VehicleOwner_active_name_idx" ON "VehicleOwner"("active", "name");

-- 3) Rifornimenti a mezzi non aziendali: targa libera gia presente in "plate",
-- qui si aggiunge solo la dichiarazione esplicita e il proprietario.
ALTER TABLE "FuelEntry" ADD COLUMN "externalVehicle" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FuelEntry" ADD COLUMN "vehicleOwnerId" TEXT;

ALTER TABLE "FuelEntry"
ADD CONSTRAINT "FuelEntry_vehicleOwnerId_fkey"
FOREIGN KEY ("vehicleOwnerId") REFERENCES "VehicleOwner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "FuelEntry_vehicleOwnerId_idx" ON "FuelEntry"("vehicleOwnerId");

-- 4) Viaggi container eseguiti con trattore o semirimorchio di terzi.
ALTER TABLE "ContainerTrip" ADD COLUMN "externalTractorPlate" TEXT;
ALTER TABLE "ContainerTrip" ADD COLUMN "externalTractorOwnerId" TEXT;
ALTER TABLE "ContainerTrip" ADD COLUMN "externalTrailerPlate" TEXT;
ALTER TABLE "ContainerTrip" ADD COLUMN "externalTrailerOwnerId" TEXT;

ALTER TABLE "ContainerTrip"
ADD CONSTRAINT "ContainerTrip_externalTractorOwnerId_fkey"
FOREIGN KEY ("externalTractorOwnerId") REFERENCES "VehicleOwner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContainerTrip"
ADD CONSTRAINT "ContainerTrip_externalTrailerOwnerId_fkey"
FOREIGN KEY ("externalTrailerOwnerId") REFERENCES "VehicleOwner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
