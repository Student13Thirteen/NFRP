-- CreateEnum
CREATE TYPE "WarehouseStatus" AS ENUM ('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'ARCHIVED');

-- CreateTable
CREATE TABLE "WarehouseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseSupplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseSupplier_pkey" PRIMARY KEY ("id")
);

-- SeedCategories
INSERT INTO "WarehouseCategory" ("id", "name", "notes", "active", "updatedAt")
VALUES
    ('warehouse-category-generica', 'Generica', 'Categoria base per materiale non ancora classificato.', true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- CreateTable
CREATE TABLE "WarehouseItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "WarehouseStatus" NOT NULL DEFAULT 'IN_STOCK',
    "categoryId" TEXT NOT NULL,
    "stockedAt" TIMESTAMP(3) NOT NULL,
    "documentDate" TIMESTAMP(3),
    "supplierId" TEXT,
    "documentNumber" TEXT,
    "code" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'pz',
    "minimumQuantity" INTEGER,
    "location" TEXT,
    "amountCents" INTEGER,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "filePath" TEXT,
    "originalFileName" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseCategory_name_key" ON "WarehouseCategory"("name");

-- CreateIndex
CREATE INDEX "WarehouseCategory_active_name_idx" ON "WarehouseCategory"("active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseSupplier_name_key" ON "WarehouseSupplier"("name");

-- CreateIndex
CREATE INDEX "WarehouseSupplier_active_name_idx" ON "WarehouseSupplier"("active", "name");

-- CreateIndex
CREATE INDEX "WarehouseItem_stockedAt_idx" ON "WarehouseItem"("stockedAt");

-- CreateIndex
CREATE INDEX "WarehouseItem_documentDate_idx" ON "WarehouseItem"("documentDate");

-- CreateIndex
CREATE INDEX "WarehouseItem_status_idx" ON "WarehouseItem"("status");

-- CreateIndex
CREATE INDEX "WarehouseItem_categoryId_idx" ON "WarehouseItem"("categoryId");

-- CreateIndex
CREATE INDEX "WarehouseItem_supplierId_idx" ON "WarehouseItem"("supplierId");

-- CreateIndex
CREATE INDEX "WarehouseItem_location_idx" ON "WarehouseItem"("location");

-- CreateIndex
CREATE INDEX "WarehouseItem_code_idx" ON "WarehouseItem"("code");

-- AddForeignKey
ALTER TABLE "WarehouseItem" ADD CONSTRAINT "WarehouseItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "WarehouseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseItem" ADD CONSTRAINT "WarehouseItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "WarehouseSupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
