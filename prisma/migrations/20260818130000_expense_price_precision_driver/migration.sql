-- Conserva il prezzo unitario con la stessa precisione millesimale usata dai rifornimenti.
ALTER TABLE "ExpenseLine"
ADD COLUMN "unitPriceMilliEuro" INTEGER NOT NULL DEFAULT 0;

-- Lo storico in centesimi viene convertito senza modificare imponibile, IVA o totale.
UPDATE "ExpenseLine"
SET "unitPriceMilliEuro" = "unitPriceCents" * 10;

-- L'autista appartiene alla singola quota, perche una riga puo essere ripartita su piu mezzi.
ALTER TABLE "ExpenseLineAllocation"
ADD COLUMN "driverId" TEXT;

CREATE INDEX "ExpenseLineAllocation_driverId_idx"
ON "ExpenseLineAllocation"("driverId");

ALTER TABLE "ExpenseLineAllocation"
ADD CONSTRAINT "ExpenseLineAllocation_driverId_fkey"
FOREIGN KEY ("driverId") REFERENCES "Driver"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill prudente: conserva eventuali scelte future e usa solo periodi datati validi.
-- Per il semirimorchio passa dal trattore attualmente associato; l'operatore puo correggere
-- l'eccezione dalla scheda manutenzione senza cambiare dati contabili.
UPDATE "ExpenseLineAllocation" allocation
SET "driverId" = (
  SELECT assignment."driverId"
  FROM "ExpenseLine" line
  JOIN "ExpenseDocument" document ON document."id" = line."documentId"
  LEFT JOIN "Trailer" trailer ON trailer."id" = allocation."trailerId"
  JOIN "TractorDriverAssignment" assignment
    ON assignment."tractorId" = COALESCE(allocation."tractorId", trailer."assignedTractorId")
   AND assignment."validFrom" <= COALESCE(document."documentDate", document."registeredAt")
   AND (assignment."validTo" IS NULL OR assignment."validTo" >= COALESCE(document."documentDate", document."registeredAt"))
  WHERE line."id" = allocation."expenseLineId"
  ORDER BY assignment."validFrom" DESC
  LIMIT 1
)
WHERE allocation."driverId" IS NULL
  AND allocation."allocationType" IN ('TRACTOR', 'TRAILER');

-- Anche le schede intervento legacy ottengono l'autista quando il semirimorchio
-- permette una risoluzione datata non ambigua. Le scelte gia presenti non cambiano.
UPDATE "Maintenance" maintenance
SET "driverId" = (
  SELECT assignment."driverId"
  FROM "Trailer" trailer
  JOIN "TractorDriverAssignment" assignment
    ON assignment."tractorId" = trailer."assignedTractorId"
   AND assignment."validFrom" <= maintenance."maintenanceDate"
   AND (assignment."validTo" IS NULL OR assignment."validTo" >= maintenance."maintenanceDate")
  WHERE trailer."id" = maintenance."trailerId"
  ORDER BY assignment."validFrom" DESC
  LIMIT 1
)
WHERE maintenance."driverId" IS NULL
  AND maintenance."trailerId" IS NOT NULL;
