-- Metadata di provenienza per import PDF multi-documento e chiave idempotente.
ALTER TABLE "ExpenseDocument"
ADD COLUMN "importKey" TEXT,
ADD COLUMN "sourcePage" INTEGER,
ADD COLUMN "sourcePageCount" INTEGER;

CREATE UNIQUE INDEX "ExpenseDocument_importKey_key" ON "ExpenseDocument"("importKey");
CREATE INDEX "ExpenseDocument_source_createdAt_idx" ON "ExpenseDocument"("source", "createdAt");
