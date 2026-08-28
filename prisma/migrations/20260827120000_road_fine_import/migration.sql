CREATE TYPE "RoadFineSource" AS ENUM ('MANUAL', 'IMPORT');

ALTER TABLE "RoadFine"
ADD COLUMN "source" "RoadFineSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "importKey" TEXT,
ADD COLUMN "extractionStatus" TEXT,
ADD COLUMN "reviewReasons" TEXT,
ADD COLUMN "extractedText" TEXT,
ALTER COLUMN "authority" DROP NOT NULL,
ALTER COLUMN "violationDate" DROP NOT NULL,
ALTER COLUMN "location" DROP NOT NULL,
ALTER COLUMN "description" DROP NOT NULL;

ALTER TABLE "RoadFine"
ADD CONSTRAINT "RoadFine_required_fields_after_review_check"
CHECK (
  "status" = 'TO_REVIEW'
  OR (
    "authority" IS NOT NULL
    AND "violationDate" IS NOT NULL
    AND "location" IS NOT NULL
    AND "description" IS NOT NULL
  )
);

CREATE UNIQUE INDEX "RoadFine_importKey_key" ON "RoadFine"("importKey");

ALTER TABLE "RoadEventAttachment"
ADD COLUMN "contentHash" TEXT;

CREATE UNIQUE INDEX "RoadEventAttachment_contentHash_key" ON "RoadEventAttachment"("contentHash");
