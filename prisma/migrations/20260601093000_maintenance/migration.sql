-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "MaintenanceCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceSupplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceSupplier_pkey" PRIMARY KEY ("id")
);

-- SeedCategories
INSERT INTO "MaintenanceCategory" ("id", "name", "notes", "active", "updatedAt")
VALUES
    ('maintenance-category-generica', 'Generica', 'Categoria base per interventi non ancora classificati.', true, CURRENT_TIMESTAMP),
    ('maintenance-category-riparazioni', 'Riparazioni', NULL, true, CURRENT_TIMESTAMP),
    ('maintenance-category-ricambi', 'Ricambi', NULL, true, CURRENT_TIMESTAMP),
    ('maintenance-category-pneumatici', 'Pneumatici', NULL, true, CURRENT_TIMESTAMP),
    ('maintenance-category-assali', 'Assali', NULL, true, CURRENT_TIMESTAMP),
    ('maintenance-category-carrozzeria', 'Carrozzeria', NULL, true, CURRENT_TIMESTAMP),
    ('maintenance-category-elettrico', 'Elettrico', NULL, true, CURRENT_TIMESTAMP),
    ('maintenance-category-tagliando', 'Tagliando', NULL, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- CreateTable
CREATE TABLE "Maintenance" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'COMPLETED',
    "categoryId" TEXT NOT NULL,
    "maintenanceDate" TIMESTAMP(3) NOT NULL,
    "documentDate" TIMESTAMP(3),
    "supplierId" TEXT,
    "documentNumber" TEXT,
    "driverId" TEXT,
    "tractorId" TEXT,
    "trailerId" TEXT,
    "odometerKm" INTEGER,
    "amountCents" INTEGER,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "filePath" TEXT,
    "originalFileName" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceCategory_name_key" ON "MaintenanceCategory"("name");

-- CreateIndex
CREATE INDEX "MaintenanceCategory_active_name_idx" ON "MaintenanceCategory"("active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceSupplier_name_key" ON "MaintenanceSupplier"("name");

-- CreateIndex
CREATE INDEX "MaintenanceSupplier_active_name_idx" ON "MaintenanceSupplier"("active", "name");

-- CreateIndex
CREATE INDEX "Maintenance_maintenanceDate_idx" ON "Maintenance"("maintenanceDate");

-- CreateIndex
CREATE INDEX "Maintenance_documentDate_idx" ON "Maintenance"("documentDate");

-- CreateIndex
CREATE INDEX "Maintenance_status_idx" ON "Maintenance"("status");

-- CreateIndex
CREATE INDEX "Maintenance_categoryId_idx" ON "Maintenance"("categoryId");

-- CreateIndex
CREATE INDEX "Maintenance_supplierId_idx" ON "Maintenance"("supplierId");

-- CreateIndex
CREATE INDEX "Maintenance_driverId_idx" ON "Maintenance"("driverId");

-- CreateIndex
CREATE INDEX "Maintenance_tractorId_idx" ON "Maintenance"("tractorId");

-- CreateIndex
CREATE INDEX "Maintenance_trailerId_idx" ON "Maintenance"("trailerId");

-- AddForeignKey
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MaintenanceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "MaintenanceSupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_tractorId_fkey" FOREIGN KEY ("tractorId") REFERENCES "Tractor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "Trailer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
