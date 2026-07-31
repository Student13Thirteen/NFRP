ALTER TABLE "TripProductLine" ADD COLUMN "salesPointId" TEXT;

UPDATE "TripProductLine"
SET "salesPointId" = "Trip"."salesPointId"
FROM "Trip"
WHERE "TripProductLine"."tripId" = "Trip"."id";

ALTER TABLE "TripProductLine" ALTER COLUMN "salesPointId" SET NOT NULL;

CREATE INDEX "TripProductLine_salesPointId_idx" ON "TripProductLine"("salesPointId");

ALTER TABLE "TripProductLine" ADD CONSTRAINT "TripProductLine_salesPointId_fkey" FOREIGN KEY ("salesPointId") REFERENCES "SalesPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
