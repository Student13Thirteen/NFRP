-- Create product registry for fuel entries.
CREATE TABLE "FuelProduct" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isFuel" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FuelProduct_code_key" ON "FuelProduct"("code");
CREATE INDEX "FuelProduct_active_name_idx" ON "FuelProduct"("active", "name");
CREATE INDEX "FuelProduct_isFuel_idx" ON "FuelProduct"("isFuel");

INSERT INTO "FuelProduct" ("id", "code", "name", "isFuel", "createdAt", "updatedAt")
VALUES
  ('fuel_product_adb', 'ADB', 'AdBlue', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fuel_product_adc', 'ADC', 'AdBlue tanica', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fuel_product_alt', 'ALT', 'Altro', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fuel_product_bwr', 'BWR', 'Benzina WR 100', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fuel_product_cng', 'CNG', 'Metano CNG', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fuel_product_cre', 'CRE', 'Costo R.E.', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fuel_product_cws', 'CWS', 'Car wash', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fuel_product_gec', 'GEC', 'Gasolio Ecoplus', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fuel_product_gls', 'GLS', 'Gasolio', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fuel_product_gpl', 'GPL', 'GPL', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fuel_product_hbz', 'HBZ', 'FuelCo Hi Perform 100 ottani', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fuel_product_hgl', 'HGL', 'FuelCo Hi Perform Diesel', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fuel_product_hvo', 'HVO', 'HVO', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fuel_product_lng', 'LNG', 'Metano LNG', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fuel_product_mtn', 'MTN', 'Metano CNG', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fuel_product_pen', 'PEN', 'Penalty R.E.', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fuel_product_pre', 'PRE', 'Prenotazione R.E.', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fuel_product_ret', 'RET', 'Ricarica elettrica', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fuel_product_ssp', 'SSP', 'Super senza piombo', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "FuelEntry" ADD COLUMN "fuelProductId" TEXT;

UPDATE "FuelEntry"
SET "fuelProductId" = "FuelProduct"."id"
FROM "FuelProduct"
WHERE "FuelEntry"."productCode" = "FuelProduct"."code";

CREATE INDEX "FuelEntry_fuelProductId_idx" ON "FuelEntry"("fuelProductId");

ALTER TABLE "FuelEntry"
ADD CONSTRAINT "FuelEntry_fuelProductId_fkey"
FOREIGN KEY ("fuelProductId") REFERENCES "FuelProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Keep cards available even when a supplier/distributor is removed.
ALTER TABLE "FuelCard" DROP CONSTRAINT "FuelCard_fuelSupplierId_fkey";
ALTER TABLE "FuelCard" ALTER COLUMN "fuelSupplierId" DROP NOT NULL;
ALTER TABLE "FuelCard"
ADD CONSTRAINT "FuelCard_fuelSupplierId_fkey"
FOREIGN KEY ("fuelSupplierId") REFERENCES "FuelSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
