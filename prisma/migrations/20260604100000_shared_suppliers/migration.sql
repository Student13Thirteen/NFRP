-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "province" TEXT,
    "country" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- Merge existing maintenance suppliers first, preserving ids used by Maintenance.supplierId.
INSERT INTO "Supplier" ("id", "name", "phone", "email", "address", "postalCode", "city", "province", "country", "notes", "active", "createdAt", "updatedAt")
SELECT "id", "name", "phone", "email", "address", NULL, NULL, NULL, NULL, "notes", "active", "createdAt", "updatedAt"
FROM "MaintenanceSupplier";

-- Merge warehouse suppliers. Exact duplicate names reuse the already inserted supplier.
INSERT INTO "Supplier" ("id", "name", "phone", "email", "address", "postalCode", "city", "province", "country", "notes", "active", "createdAt", "updatedAt")
SELECT ws."id", ws."name", ws."phone", ws."email", ws."address", NULL, NULL, NULL, NULL, ws."notes", ws."active", ws."createdAt", ws."updatedAt"
FROM "WarehouseSupplier" ws
WHERE NOT EXISTS (
    SELECT 1 FROM "Supplier" s WHERE s."name" = ws."name"
);

-- Repoint warehouse items whose supplier name already existed in maintenance suppliers.
UPDATE "WarehouseItem" wi
SET "supplierId" = s."id"
FROM "WarehouseSupplier" ws
JOIN "Supplier" s ON s."name" = ws."name"
WHERE wi."supplierId" = ws."id";

-- Drop old foreign keys.
ALTER TABLE "Maintenance" DROP CONSTRAINT "Maintenance_supplierId_fkey";
ALTER TABLE "WarehouseItem" DROP CONSTRAINT "WarehouseItem_supplierId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE INDEX "Supplier_active_name_idx" ON "Supplier"("active", "name");

-- AddForeignKey
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseItem" ADD CONSTRAINT "WarehouseItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop old supplier tables.
DROP TABLE "MaintenanceSupplier";
DROP TABLE "WarehouseSupplier";
