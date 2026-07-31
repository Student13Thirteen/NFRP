ALTER TABLE "Document"
ADD COLUMN "amountCents" INTEGER;

ALTER TABLE "DocumentInboxItem"
ADD COLUMN "suggestedNotes" TEXT,
ADD COLUMN "suggestedAmountCents" INTEGER;
