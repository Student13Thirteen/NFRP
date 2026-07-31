CREATE TYPE "UserRole" AS ENUM ('ADMIN');
CREATE TYPE "EntityType" AS ENUM ('DRIVER', 'TRACTOR', 'TRAILER', 'OTHER');
CREATE TYPE "DocumentStatus" AS ENUM ('VALID', 'EXPIRING', 'EXPIRED', 'RENEWED', 'ARCHIVED');
CREATE TYPE "NotificationType" AS ENUM ('NOTICE', 'TEST');
CREATE TYPE "NotificationChannel" AS ENUM ('TELEGRAM');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Driver" (
  "id" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Tractor" (
  "id" TEXT NOT NULL,
  "plate" TEXT NOT NULL,
  "brand" TEXT,
  "model" TEXT,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Tractor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Trailer" (
  "id" TEXT NOT NULL,
  "plate" TEXT NOT NULL,
  "brand" TEXT,
  "model" TEXT,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Trailer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OtherEntity" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OtherEntity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentType" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "suggestedEntityType" "EntityType" NOT NULL,
  "defaultNoticeDays" INTEGER NOT NULL DEFAULT 30,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Document" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "documentTypeId" TEXT NOT NULL,
  "entityType" "EntityType" NOT NULL,
  "driverId" TEXT,
  "tractorId" TEXT,
  "trailerId" TEXT,
  "otherEntityId" TEXT,
  "issueDate" TIMESTAMP(3),
  "expiryDate" TIMESTAMP(3) NOT NULL,
  "noticeDays" INTEGER NOT NULL,
  "notes" TEXT,
  "status" "DocumentStatus" NOT NULL DEFAULT 'VALID',
  "filePath" TEXT NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "renewedFromId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationLog" (
  "id" TEXT NOT NULL,
  "documentId" TEXT,
  "type" "NotificationType" NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "success" BOOLEAN NOT NULL,
  "error" TEXT,
  "dedupeKey" TEXT,
  CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppSetting" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Driver_lastName_firstName_idx" ON "Driver"("lastName", "firstName");
CREATE UNIQUE INDEX "Tractor_plate_key" ON "Tractor"("plate");
CREATE UNIQUE INDEX "Trailer_plate_key" ON "Trailer"("plate");
CREATE INDEX "OtherEntity_category_name_idx" ON "OtherEntity"("category", "name");
CREATE UNIQUE INDEX "DocumentType_name_key" ON "DocumentType"("name");
CREATE INDEX "Document_expiryDate_idx" ON "Document"("expiryDate");
CREATE INDEX "Document_status_idx" ON "Document"("status");
CREATE INDEX "Document_entityType_idx" ON "Document"("entityType");
CREATE INDEX "Document_driverId_idx" ON "Document"("driverId");
CREATE INDEX "Document_tractorId_idx" ON "Document"("tractorId");
CREATE INDEX "Document_trailerId_idx" ON "Document"("trailerId");
CREATE INDEX "Document_otherEntityId_idx" ON "Document"("otherEntityId");
CREATE UNIQUE INDEX "NotificationLog_dedupeKey_key" ON "NotificationLog"("dedupeKey");
CREATE INDEX "NotificationLog_documentId_idx" ON "NotificationLog"("documentId");
CREATE INDEX "NotificationLog_sentAt_idx" ON "NotificationLog"("sentAt");

ALTER TABLE "Document" ADD CONSTRAINT "Document_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_tractorId_fkey" FOREIGN KEY ("tractorId") REFERENCES "Tractor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "Trailer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_otherEntityId_fkey" FOREIGN KEY ("otherEntityId") REFERENCES "OtherEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_renewedFromId_fkey" FOREIGN KEY ("renewedFromId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
