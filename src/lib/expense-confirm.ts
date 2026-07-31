import 'server-only';

import { Prisma, WarehouseStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { removeStoredPdf } from '@/lib/files';
import { sumDocumentTotals } from '@/lib/expense';

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
 * Conferma un documento: materializza le righe a magazzino (crea/incrementa WarehouseItem
 * + movimento LOAD), ricalcola i totali, azzera reviewReasons, stato -> CONFIRMED.
 * Le righe su targa restano attribuite al mezzo tramite la riga stessa.
 */
export async function confirmExpenseDocument(documentId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const doc = await tx.expenseDocument.findUnique({
      where: { id: documentId },
      include: { lines: true }
    });
    if (!doc) throw new Error('Documento di spesa non trovato.');
    if (
      doc.source === 'MAINTENANCE_IMPORT' &&
      doc.lines.some((line) => !['WAREHOUSE', 'TRACTOR', 'TRAILER'].includes(line.allocationType))
    ) {
      throw new Error('Assegna ogni riga al Magazzino oppure a una targa valida prima di confermare.');
    }
    if (
      doc.source === 'LEASE_INVOICE_IMPORT' &&
      doc.lines.some((line) => line.allocationType !== 'TRACTOR' && line.allocationType !== 'TRAILER')
    ) {
      throw new Error('Assegna una targa valida a ogni riga prima di confermare.');
    }

    for (const line of doc.lines) {
      if (line.allocationType !== 'WAREHOUSE') continue;
      if (line.warehouseItemId) continue; // già materializzata

      const unitCostCents = unitCostFrom(line.imponibileCents, line.quantityMilli);
      const quantity = Math.max(0, Math.round(line.quantityMilli / 1000));

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
            amountCents: line.imponibileCents,
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
          quantityMilli: line.quantityMilli,
          unitCostCents,
          amountCents: line.imponibileCents,
          movementDate: doc.registeredAt,
          sourceExpenseLineId: line.id,
          notes: doc.documentNumber ? `Carico da documento ${doc.documentNumber}` : 'Carico da documento di spesa'
        }
      });

      await tx.expenseLine.update({ where: { id: line.id }, data: { warehouseItemId } });
    }

    await recomputeDocumentTotals(tx, documentId);
    await tx.expenseDocument.update({
      where: { id: documentId },
      data: { status: 'CONFIRMED', reviewReasons: null }
    });
  });
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
