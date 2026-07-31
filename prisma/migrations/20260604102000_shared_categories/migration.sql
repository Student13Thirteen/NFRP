-- Create shared category table.
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- Merge maintenance categories first, preserving ids used by Maintenance.categoryId.
INSERT INTO "Category" ("id", "name", "notes", "active", "createdAt", "updatedAt")
SELECT "id", "name", "notes", "active", "createdAt", "updatedAt"
FROM "MaintenanceCategory";

-- Merge warehouse categories. Exact duplicate names reuse the already inserted category.
INSERT INTO "Category" ("id", "name", "notes", "active", "createdAt", "updatedAt")
SELECT wc."id", wc."name", wc."notes", wc."active", wc."createdAt", wc."updatedAt"
FROM "WarehouseCategory" wc
WHERE NOT EXISTS (
    SELECT 1 FROM "Category" c WHERE c."name" = wc."name"
);

-- Repoint warehouse items whose category name already existed in maintenance categories.
UPDATE "WarehouseItem" wi
SET "categoryId" = c."id"
FROM "WarehouseCategory" wc
JOIN "Category" c ON c."name" = wc."name"
WHERE wi."categoryId" = wc."id";

-- Drop old foreign keys.
ALTER TABLE "Maintenance" DROP CONSTRAINT "Maintenance_categoryId_fkey";
ALTER TABLE "WarehouseItem" DROP CONSTRAINT "WarehouseItem_categoryId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE INDEX "Category_active_name_idx" ON "Category"("active", "name");

-- AddForeignKey
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseItem" ADD CONSTRAINT "WarehouseItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop old category tables.
DROP TABLE "MaintenanceCategory";
DROP TABLE "WarehouseCategory";
