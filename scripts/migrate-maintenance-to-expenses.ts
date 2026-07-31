/**
 * Migra lo storico (Maintenance + WarehouseItem) verso il nuovo modello "documento di spesa".
 * Riusa SOLO i campi strutturati del gestionale, non interpreta il testo libero.
 * I documenti creati sono PENDING source=MIGRATION: vanno validati dalla pagina di revisione.
 * L'IVA non era tracciata -> ipotizzata 22% e segnalata. Le note sono copiate verbatim.
 * I record legacy NON vengono cancellati; il flag `migratedToExpense` evita doppioni.
 *
 * Uso (dentro il container app):
 *   # anteprima senza scrivere
 *   NODE_OPTIONS='--conditions react-server' npx tsx scripts/migrate-maintenance-to-expenses.ts --dry-run
 *   # esecuzione reale
 *   NODE_OPTIONS='--conditions react-server' npx tsx scripts/migrate-maintenance-to-expenses.ts
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  mapMaintenanceToExpense,
  mapWarehouseItemToExpense,
  type MigrationDocInput
} from '@/lib/expense-migration';
import { formatEuroCents } from '@/lib/expense-shared';

const DRY_RUN = process.argv.includes('--dry-run');

function describe(kind: string, ref: string, doc: MigrationDocInput) {
  const alloc = doc.line.allocationType;
  console.log(
    `  [${kind}] ${ref} -> netto ${formatEuroCents(doc.totalImponibileCents)} / ivato ${formatEuroCents(
      doc.totalAmountCents
    )} · allocazione ${alloc}${doc.reviewReasons ? ` · ⚠ ${doc.reviewReasons}` : ''}`
  );
}

async function createDocument(tx: Prisma.TransactionClient, doc: MigrationDocInput): Promise<void> {
  await tx.expenseDocument.create({
    data: {
      status: doc.status,
      source: doc.source,
      supplierId: doc.supplierId,
      supplierName: doc.supplierName,
      documentNumber: doc.documentNumber,
      documentDate: doc.documentDate,
      registeredAt: doc.registeredAt,
      notes: doc.notes,
      reviewReasons: doc.reviewReasons,
      totalImponibileCents: doc.totalImponibileCents,
      totalVatCents: doc.totalVatCents,
      totalAmountCents: doc.totalAmountCents,
      filePath: doc.filePath,
      originalFileName: doc.originalFileName,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      lines: {
        create: [
          {
            position: 0,
            code: doc.line.code,
            description: doc.line.description,
            quantityMilli: doc.line.quantityMilli,
            unit: doc.line.unit,
            unitPriceCents: doc.line.unitPriceCents,
            imponibileCents: doc.line.imponibileCents,
            vatRatePercent: doc.line.vatRatePercent,
            vatCents: doc.line.vatCents,
            totalCents: doc.line.totalCents,
            categoryId: doc.line.categoryId,
            allocationType: doc.line.allocationType,
            tractorId: doc.line.tractorId,
            trailerId: doc.line.trailerId,
            warehouseItemId: doc.line.warehouseItemId,
            odometerKm: doc.line.odometerKm
          }
        ]
      }
    }
  });
}

async function main() {
  console.log(DRY_RUN ? '== ANTEPRIMA (nessuna scrittura) ==' : '== MIGRAZIONE STORICO ==');

  const [maintenances, warehouseItems] = await Promise.all([
    prisma.maintenance.findMany({ where: { migratedToExpense: false }, orderBy: { maintenanceDate: 'asc' } }),
    prisma.warehouseItem.findMany({ where: { migratedToExpense: false }, orderBy: { stockedAt: 'asc' } })
  ]);

  console.log(`Manutenzioni da migrare: ${maintenances.length}`);
  console.log(`Articoli magazzino da migrare: ${warehouseItems.length}`);

  let created = 0;

  for (const maintenance of maintenances) {
    const doc = mapMaintenanceToExpense(maintenance);
    describe('MANUT', maintenance.title, doc);
    if (!DRY_RUN) {
      await prisma.$transaction(async (tx) => {
        await createDocument(tx, doc);
        await tx.maintenance.update({ where: { id: maintenance.id }, data: { migratedToExpense: true } });
      });
      created += 1;
    }
  }

  for (const item of warehouseItems) {
    const doc = mapWarehouseItemToExpense(item);
    describe('MAGAZ', item.title, doc);
    if (!DRY_RUN) {
      await prisma.$transaction(async (tx) => {
        await createDocument(tx, doc);
        await tx.warehouseItem.update({ where: { id: item.id }, data: { migratedToExpense: true } });
      });
      created += 1;
    }
  }

  if (DRY_RUN) {
    console.log(`\nAnteprima completata: verrebbero creati ${maintenances.length + warehouseItems.length} documenti PENDING.`);
  } else {
    console.log(`\nMigrazione completata: ${created} documenti PENDING creati. Validali dalla pagina di revisione.`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Migrazione storico fallita.', error);
    await prisma.$disconnect();
    process.exit(1);
  });
