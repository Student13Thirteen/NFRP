-- Inbox PDF: analisi OCR asincrona in background.
-- analyzedAt NULL = item appena caricato, analisi automatica ancora in coda/in corso.
-- analyzedAt valorizzato = analisi automatica completata (anche se non ha riconosciuto nulla).

-- AlterTable
ALTER TABLE "DocumentInboxItem" ADD COLUMN "analyzedAt" TIMESTAMP(3);

-- Backfill: gli item inbox esistenti erano già stati analizzati in modo sincrono.
UPDATE "DocumentInboxItem" SET "analyzedAt" = "createdAt" WHERE "analyzedAt" IS NULL;
