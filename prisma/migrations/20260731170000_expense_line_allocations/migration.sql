-- Una riga contabile resta unica, ma la sua quantita puo essere ripartita
-- tra magazzino e piu mezzi senza duplicare il costo del documento.
CREATE TABLE "ExpenseLineAllocation" (
    "id" TEXT NOT NULL,
    "expenseLineId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "allocationType" "ExpenseAllocationType" NOT NULL,
    "quantityMilli" INTEGER NOT NULL,
    "tractorId" TEXT,
    "trailerId" TEXT,
    "warehouseItemId" TEXT,
    "odometerKm" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseLineAllocation_pkey" PRIMARY KEY ("id")
);

-- Ogni assegnazione storica diventa una quota unica: nessun dato o costo cambia.
INSERT INTO "ExpenseLineAllocation" (
    "id",
    "expenseLineId",
    "position",
    "allocationType",
    "quantityMilli",
    "tractorId",
    "trailerId",
    "warehouseItemId",
    "odometerKm",
    "createdAt",
    "updatedAt"
)
SELECT
    'legacy-' || "id",
    "id",
    0,
    "allocationType",
    "quantityMilli",
    "tractorId",
    "trailerId",
    "warehouseItemId",
    "odometerKm",
    "createdAt",
    "updatedAt"
FROM "ExpenseLine";

CREATE UNIQUE INDEX "ExpenseLineAllocation_expenseLineId_position_key"
    ON "ExpenseLineAllocation"("expenseLineId", "position");
CREATE INDEX "ExpenseLineAllocation_allocationType_idx" ON "ExpenseLineAllocation"("allocationType");
CREATE INDEX "ExpenseLineAllocation_tractorId_idx" ON "ExpenseLineAllocation"("tractorId");
CREATE INDEX "ExpenseLineAllocation_trailerId_idx" ON "ExpenseLineAllocation"("trailerId");
CREATE INDEX "ExpenseLineAllocation_warehouseItemId_idx" ON "ExpenseLineAllocation"("warehouseItemId");

ALTER TABLE "ExpenseLineAllocation"
    ADD CONSTRAINT "ExpenseLineAllocation_expenseLineId_fkey"
    FOREIGN KEY ("expenseLineId") REFERENCES "ExpenseLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseLineAllocation"
    ADD CONSTRAINT "ExpenseLineAllocation_tractorId_fkey"
    FOREIGN KEY ("tractorId") REFERENCES "Tractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseLineAllocation"
    ADD CONSTRAINT "ExpenseLineAllocation_trailerId_fkey"
    FOREIGN KEY ("trailerId") REFERENCES "Trailer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseLineAllocation"
    ADD CONSTRAINT "ExpenseLineAllocation_warehouseItemId_fkey"
    FOREIGN KEY ("warehouseItemId") REFERENCES "WarehouseItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
