CREATE TABLE "TripProduct" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TripProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TripProduct_name_key" ON "TripProduct"("name");
CREATE INDEX "TripProduct_active_name_idx" ON "TripProduct"("active", "name");

INSERT INTO "TripProduct" ("id", "name", "notes", "active", "createdAt", "updatedAt")
VALUES
  ('seed-trip-product-benzina', 'Benzina', 'Prodotto iniziale creato dalla migrazione viaggi.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-trip-product-gasolio', 'Gasolio', 'Prodotto iniziale creato dalla migrazione viaggi.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-trip-product-gpl', 'GPL', 'Prodotto iniziale creato dalla migrazione viaggi.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-trip-product-jet-a1', 'Jet A1', 'Prodotto iniziale creato dalla migrazione viaggi.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "Trip" ADD COLUMN "productId" TEXT;
ALTER TABLE "Trip" ADD COLUMN "liters" INTEGER NOT NULL DEFAULT 0;

UPDATE "Trip"
SET
  "productId" = CASE
    WHEN "dieselLiters" > 0 THEN 'seed-trip-product-gasolio'
    WHEN "gasolineLiters" > 0 THEN 'seed-trip-product-benzina'
    WHEN "gplLiters" > 0 THEN 'seed-trip-product-gpl'
    WHEN "jetLiters" > 0 THEN 'seed-trip-product-jet-a1'
    ELSE NULL
  END,
  "liters" = CASE
    WHEN "dieselLiters" > 0 THEN "dieselLiters"
    WHEN "gasolineLiters" > 0 THEN "gasolineLiters"
    WHEN "gplLiters" > 0 THEN "gplLiters"
    WHEN "jetLiters" > 0 THEN "jetLiters"
    ELSE 0
  END
WHERE "productId" IS NULL;

CREATE INDEX "Trip_productId_idx" ON "Trip"("productId");
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_productId_fkey" FOREIGN KEY ("productId") REFERENCES "TripProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
