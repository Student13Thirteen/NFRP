CREATE TABLE "DocumentRequirementExclusion" (
  "id" TEXT NOT NULL,
  "entityType" "EntityType" NOT NULL,
  "documentTypeId" TEXT NOT NULL,
  "driverId" TEXT,
  "tractorId" TEXT,
  "trailerId" TEXT,
  "otherEntityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DocumentRequirementExclusion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentRequirementExclusion_documentTypeId_driverId_key"
ON "DocumentRequirementExclusion"("documentTypeId", "driverId");

CREATE UNIQUE INDEX "DocumentRequirementExclusion_documentTypeId_tractorId_key"
ON "DocumentRequirementExclusion"("documentTypeId", "tractorId");

CREATE UNIQUE INDEX "DocumentRequirementExclusion_documentTypeId_trailerId_key"
ON "DocumentRequirementExclusion"("documentTypeId", "trailerId");

CREATE UNIQUE INDEX "DocumentRequirementExclusion_documentTypeId_otherEntityId_key"
ON "DocumentRequirementExclusion"("documentTypeId", "otherEntityId");

CREATE INDEX "DocumentRequirementExclusion_entityType_idx" ON "DocumentRequirementExclusion"("entityType");
CREATE INDEX "DocumentRequirementExclusion_documentTypeId_idx" ON "DocumentRequirementExclusion"("documentTypeId");
CREATE INDEX "DocumentRequirementExclusion_driverId_idx" ON "DocumentRequirementExclusion"("driverId");
CREATE INDEX "DocumentRequirementExclusion_tractorId_idx" ON "DocumentRequirementExclusion"("tractorId");
CREATE INDEX "DocumentRequirementExclusion_trailerId_idx" ON "DocumentRequirementExclusion"("trailerId");
CREATE INDEX "DocumentRequirementExclusion_otherEntityId_idx" ON "DocumentRequirementExclusion"("otherEntityId");

ALTER TABLE "DocumentRequirementExclusion"
ADD CONSTRAINT "DocumentRequirementExclusion_documentTypeId_fkey"
FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentRequirementExclusion"
ADD CONSTRAINT "DocumentRequirementExclusion_driverId_fkey"
FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentRequirementExclusion"
ADD CONSTRAINT "DocumentRequirementExclusion_tractorId_fkey"
FOREIGN KEY ("tractorId") REFERENCES "Tractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentRequirementExclusion"
ADD CONSTRAINT "DocumentRequirementExclusion_trailerId_fkey"
FOREIGN KEY ("trailerId") REFERENCES "Trailer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentRequirementExclusion"
ADD CONSTRAINT "DocumentRequirementExclusion_otherEntityId_fkey"
FOREIGN KEY ("otherEntityId") REFERENCES "OtherEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
