CREATE TABLE "TripProductLine" (
  "id" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "liters" INTEGER NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TripProductLine_pkey" PRIMARY KEY ("id")
);

INSERT INTO "TripProductLine" ("id", "tripId", "productId", "liters", "position", "createdAt", "updatedAt")
SELECT
  CONCAT('trip-product-line-', "id"),
  "id",
  "productId",
  "liters",
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Trip"
WHERE "productId" IS NOT NULL AND "liters" > 0;

CREATE INDEX "TripProductLine_tripId_position_idx" ON "TripProductLine"("tripId", "position");
CREATE INDEX "TripProductLine_productId_idx" ON "TripProductLine"("productId");

ALTER TABLE "TripProductLine" ADD CONSTRAINT "TripProductLine_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripProductLine" ADD CONSTRAINT "TripProductLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "TripProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
