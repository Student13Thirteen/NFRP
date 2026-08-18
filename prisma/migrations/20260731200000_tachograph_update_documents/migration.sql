-- Documenti come l'evidenza di aggiornamento software del tachigrafo non hanno
-- una scadenza stampata. Gli altri tipi continuano a richiederla per default.
ALTER TABLE "DocumentType"
ADD COLUMN "expiryRequired" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Document"
ALTER COLUMN "expiryDate" DROP NOT NULL;

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
  'tachograph-digital-software-update',
  'Aggiornamento tachigrafo digitale',
  'TRACTOR',
  30,
  false,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO UPDATE
SET
  "suggestedEntityType" = 'TRACTOR',
  "expiryRequired" = false,
  "active" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
