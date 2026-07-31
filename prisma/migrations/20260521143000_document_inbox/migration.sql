CREATE TYPE "DocumentInboxStatus" AS ENUM ('PENDING', 'IMPORTED', 'DISCARDED');

CREATE TABLE "DocumentInboxItem" (
  "id" TEXT NOT NULL,
  "status" "DocumentInboxStatus" NOT NULL DEFAULT 'PENDING',
  "filePath" TEXT NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "extractedText" TEXT,
  "extractionStatus" TEXT,
  "suggestedTitle" TEXT,
  "suggestedDocumentTypeId" TEXT,
  "suggestedEntityType" "EntityType",
  "suggestedEntityId" TEXT,
  "suggestedIssueDate" TIMESTAMP(3),
  "suggestedExpiryDate" TIMESTAMP(3),
  "suggestedNoticeDays" INTEGER,
  "confidence" INTEGER NOT NULL DEFAULT 0,
  "analysisNotes" TEXT,
  "documentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentInboxItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentInboxItem_status_createdAt_idx" ON "DocumentInboxItem"("status", "createdAt");
CREATE INDEX "DocumentInboxItem_documentId_idx" ON "DocumentInboxItem"("documentId");
CREATE INDEX "DocumentInboxItem_suggestedDocumentTypeId_idx" ON "DocumentInboxItem"("suggestedDocumentTypeId");
