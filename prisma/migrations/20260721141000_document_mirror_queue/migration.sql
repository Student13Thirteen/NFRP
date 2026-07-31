CREATE TYPE "DocumentMirrorJobOperation" AS ENUM ('SYNC', 'DELETE');
CREATE TYPE "DocumentMirrorJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "DocumentMirrorJob" (
  "id" TEXT NOT NULL,
  "documentId" TEXT,
  "operation" "DocumentMirrorJobOperation" NOT NULL DEFAULT 'SYNC',
  "previousRemotePath" TEXT,
  "uploadRequired" BOOLEAN NOT NULL DEFAULT true,
  "status" "DocumentMirrorJobStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DocumentMirrorJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentMirrorJob_status_availableAt_createdAt_idx"
  ON "DocumentMirrorJob"("status", "availableAt", "createdAt");
CREATE INDEX "DocumentMirrorJob_documentId_status_idx"
  ON "DocumentMirrorJob"("documentId", "status");
CREATE INDEX "DocumentMirrorJob_completedAt_idx"
  ON "DocumentMirrorJob"("completedAt");
