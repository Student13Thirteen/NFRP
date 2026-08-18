-- Storico additivo delle associazioni trattore-autista.
CREATE TABLE "TractorDriverAssignment" (
    "id" TEXT NOT NULL,
    "tractorId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TractorDriverAssignment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TractorDriverAssignment_valid_period_check" CHECK ("validTo" IS NULL OR "validTo" >= "validFrom")
);

CREATE INDEX "TractorDriverAssignment_tractorId_validFrom_validTo_idx"
ON "TractorDriverAssignment"("tractorId", "validFrom", "validTo");

CREATE INDEX "TractorDriverAssignment_driverId_validFrom_validTo_idx"
ON "TractorDriverAssignment"("driverId", "validFrom", "validTo");

ALTER TABLE "TractorDriverAssignment"
ADD CONSTRAINT "TractorDriverAssignment_tractorId_fkey"
FOREIGN KEY ("tractorId") REFERENCES "Tractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TractorDriverAssignment"
ADD CONSTRAINT "TractorDriverAssignment_driverId_fkey"
FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Il vecchio abbinamento corrente viene conservato come periodo aperto da oggi.
-- Non viene retrodatato: i record storici non devono essere attribuiti senza evidenza.
INSERT INTO "TractorDriverAssignment" (
    "id", "tractorId", "driverId", "validFrom", "validTo", "notes", "createdAt", "updatedAt"
)
SELECT
    'assignment-' || md5(t."id" || ':' || t."assignedDriverId" || ':' || CURRENT_DATE::text),
    t."id",
    t."assignedDriverId",
    CURRENT_DATE,
    NULL,
    'Associazione corrente migrata dal precedente campo trattore.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Tractor" t
WHERE t."assignedDriverId" IS NOT NULL;

-- Categoria richiesta per gli interventi di lavaggio; riattiva l'eventuale voce esistente.
INSERT INTO "Category" ("id", "name", "notes", "active", "createdAt", "updatedAt")
VALUES (
    'maintenance-category-lavaggio',
    'Lavaggio',
    'Lavaggio esterno, interno, cisterna o sanificazione del mezzo.',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO UPDATE
SET "active" = true, "updatedAt" = CURRENT_TIMESTAMP;
