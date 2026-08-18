import 'server-only';

import { Prisma, WarehouseStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { removeStoredPdf } from '@/lib/files';
import { allocateExpenseLineAmounts, sumDocumentTotals } from '@/lib/expense';

const DEFAULT_WAREHOUSE_CATEGORY = 'Magazzino';

function inferWarehouseStatus(quantity: number, minimumQuantity: number | null): WarehouseStatus {
  if (quantity <= 0) return WarehouseStatus.OUT_OF_STOCK;
  if (minimumQuantity !== null && quantity <= minimumQuantity) return WarehouseStatus.LOW_STOCK;
  return WarehouseStatus.IN_STOCK;
}

function unitCostFrom(imponibileCents: number, quantityMilli: number): number | null {
  if (quantityMilli <= 0) return null;
  return Math.round((imponibileCents * 1000) / quantityMilli);
}

async function ensureWarehouseCategoryId(tx: Prisma.TransactionClient, fallbackCategoryId: string | null): Promise<string> {
  if (fallbackCategoryId) return fallbackCategoryId;
  const existing = await tx.category.findUnique({ where: { name: DEFAULT_WAREHOUSE_CATEGORY } });
  if (existing) return existing.id;
  const created = await tx.category.create({ data: { name: DEFAULT_WAREHOUSE_CATEGORY } });
  return created.id;
}

/** Ricalcola e salva i totali denormalizzati del documento dalle sue righe. */
export async function recomputeDocumentTotals(tx: Prisma.TransactionClient, documentId: string): Promise<void> {
  const lines = await tx.expenseLine.findMany({
    where: { documentId },
    select: { imponibileCents: true, vatCents: true, totalCents: true }
  });
  const totals = sumDocumentTotals(lines);
  await tx.expenseDocument.update({ where: { id: documentId }, data: totals });
}

/**
 * Conferma un documento: materializza le quote a magazzino (crea/incrementa WarehouseItem
 * + movimento LOAD), ricalcola i totali, azzera reviewReasons, stato -> CONFIRMED.
 * Netto e IVA restano quelli della riga contabile e vengono ripartiti al centesimo tra le quote.
 */
export async function confirmExpenseDocumentInTransaction(
  tx: Prisma.TransactionClient,
  documentId: string
): Promise<void> {
  // La transizione condizionale fa anche da lock: una doppia richiesta puo
  // confermare e materializzare il magazzino una sola volta. Se qualcosa
  // fallisce, l'intera transazione torna PENDING.
  const claimed = await tx.expenseDocument.updateMany({
    where: { id: documentId, status: 'PENDING' },
    data: { status: 'CONFIRMED' }
  });
  if (claimed.count === 0) {
    const existing = await tx.expenseDocument.findUnique({
      where: { id: documentId },
      select: { status: true }
    });
    if (!existing) throw new Error('Documento di spesa non trovato.');
    if (existing.status === 'CONFIRMED') return;
    throw new Error('Il documento non può essere confermato nello stato corrente.');
  }

  const doc = await tx.expenseDocument.findUnique({
    where: { id: documentId },
    include: { lines: { include: { allocations: { orderBy: { position: 'asc' } } } } }
  });
  if (!doc) throw new Error('Documento di spesa non trovato.');
  for (const line of doc.lines) {
    let lineAllocations = line.allocations;
    if (lineAllocations.length === 0) {
      const created = await tx.expenseLineAllocation.create({
        data: {
          expenseLineId: line.id,
          position: 0,
          allocationType: line.allocationType,
          quantityMilli: line.quantityMilli,
          tractorId: line.tractorId,
          trailerId: line.trailerId,
          warehouseItemId: line.warehouseItemId,
          odometerKm: line.odometerKm
        }
      });
      lineAllocations = [created];
    }

    if (
      lineAllocations.some((allocation) => allocation.quantityMilli <= 0) ||
      lineAllocations.reduce((sum, allocation) => sum + allocation.quantityMilli, 0) !== line.quantityMilli
    ) {
      throw new Error(`La ripartizione della riga «${line.description}» non coincide con la quantità fatturata.`);
    }
    if (
      doc.source === 'MAINTENANCE_IMPORT' &&
      lineAllocations.some((allocation) => !['WAREHOUSE', 'TRACTOR', 'TRAILER'].includes(allocation.allocationType))
    ) {
      throw new Error('Assegna ogni quantità al Magazzino oppure a una targa valida prima di confermare.');
    }
    if (
      doc.source === 'LEASE_INVOICE_IMPORT' &&
      lineAllocations.some((allocation) => allocation.allocationType !== 'TRACTOR' && allocation.allocationType !== 'TRAILER')
    ) {
      throw new Error('Assegna una targa valida a ogni riga prima di confermare.');
    }

    const allocatedAmounts = allocateExpenseLineAmounts(line, lineAllocations);
    for (let allocationIndex = 0; allocationIndex < lineAllocations.length; allocationIndex += 1) {
      const allocation = lineAllocations[allocationIndex];
      if (allocation.allocationType !== 'WAREHOUSE' || allocation.warehouseItemId) continue;
      const allocationAmounts = allocatedAmounts[allocationIndex];
      const unitCostCents = unitCostFrom(allocationAmounts.imponibileCents, allocation.quantityMilli);
      const quantity = Math.max(0, Math.round(allocation.quantityMilli / 1000));

      // Se esiste già un articolo con lo stesso codice, incremento la giacenza.
      const existing = line.code
        ? await tx.warehouseItem.findFirst({ where: { code: line.code }, orderBy: { createdAt: 'desc' } })
        : null;

      let warehouseItemId: string;
      if (existing) {
        const newQuantity = existing.quantity + quantity;
        await tx.warehouseItem.update({
          where: { id: existing.id },
          data: {
            quantity: newQuantity,
            status: inferWarehouseStatus(newQuantity, existing.minimumQuantity),
            unitCostCents: unitCostCents ?? existing.unitCostCents,
            vatRatePercent: line.vatRatePercent
          }
        });
        warehouseItemId = existing.id;
      } else {
        const categoryId = await ensureWarehouseCategoryId(tx, line.categoryId);
        const created = await tx.warehouseItem.create({
          data: {
            title: (line.description || line.code || 'Articolo').slice(0, 180),
            status: inferWarehouseStatus(quantity, null),
            categoryId,
            stockedAt: doc.registeredAt,
            documentDate: doc.documentDate,
            supplierId: doc.supplierId,
            documentNumber: doc.documentNumber,
            code: line.code,
            quantity,
            unit: line.unit,
            amountCents: allocationAmounts.imponibileCents,
            unitCostCents,
            vatRatePercent: line.vatRatePercent,
            description: line.description,
            sourceExpenseLineId: line.id
          }
        });
        warehouseItemId = created.id;
      }

      await tx.warehouseMovement.create({
        data: {
          warehouseItemId,
          type: 'LOAD',
          quantityMilli: allocation.quantityMilli,
          unitCostCents,
          amountCents: allocationAmounts.imponibileCents,
          movementDate: doc.registeredAt,
          sourceExpenseLineId: line.id,
          notes: doc.documentNumber ? `Carico da documento ${doc.documentNumber}` : 'Carico da documento di spesa'
        }
      });

      await tx.expenseLineAllocation.update({ where: { id: allocation.id }, data: { warehouseItemId } });
      if (lineAllocations.length === 1) {
        await tx.expenseLine.update({ where: { id: line.id }, data: { warehouseItemId } });
      }
    }
  }

  await recomputeDocumentTotals(tx, documentId);
  await tx.expenseDocument.update({
    where: { id: documentId },
    data: { reviewReasons: null }
  });
}

export async function confirmExpenseDocument(documentId: string): Promise<void> {
  await prisma.$transaction((tx) => confirmExpenseDocumentInTransaction(tx, documentId));
}

export async function confirmAllPendingExpenses(): Promise<number> {
  const pending = await prisma.expenseDocument.findMany({ where: { status: 'PENDING' }, select: { id: true } });
  for (const doc of pending) {
    await confirmExpenseDocument(doc.id);
  }
  return pending.length;
}

/** Elimina un documento (cascade sulle righe) e il PDF allegato. Non scarica il magazzino già caricato. */
export async function deleteExpenseDocument(documentId: string): Promise<void> {
  const doc = await prisma.expenseDocument.findUnique({ where: { id: documentId }, select: { filePath: true } });
  if (!doc) return;
  await prisma.expenseDocument.delete({ where: { id: documentId } });
  if (doc.filePath) {
    try {
      await removeStoredPdf(doc.filePath);
    } catch (error) {
      console.error('Impossibile eliminare il PDF del documento di spesa.', {
        documentId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export async function deleteAllPendingExpenses(): Promise<number> {
  const pending = await prisma.expenseDocument.findMany({ where: { status: 'PENDING' }, select: { id: true } });
  for (const doc of pending) {
    await deleteExpenseDocument(doc.id);
  }
  return pending.length;
}
