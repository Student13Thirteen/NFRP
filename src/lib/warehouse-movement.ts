import 'server-only';

import { Prisma, WarehouseStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { allocationToDbFields } from '@/lib/expense';

export const warehouseMovementInclude = Prisma.validator<Prisma.WarehouseMovementInclude>()({
  tractor: true,
  trailer: true
});

export type WarehouseMovementWithRelations = Prisma.WarehouseMovementGetPayload<{
  include: typeof warehouseMovementInclude;
}>;

function inferWarehouseStatus(quantity: number, minimumQuantity: number | null): WarehouseStatus {
  if (quantity <= 0) return WarehouseStatus.OUT_OF_STOCK;
  if (minimumQuantity !== null && quantity <= minimumQuantity) return WarehouseStatus.LOW_STOCK;
  return WarehouseStatus.IN_STOCK;
}

export type MountOnVehicleInput = {
  vehicleKey: string; // TRACTOR:<id> | TRAILER:<id>
  quantity: number; // pezzi interi da scaricare
  movementDate: Date;
  notes: string | null;
};

/** Scarica una quantità dalla giacenza e la "monta" su una targa, attribuendone il costo al mezzo. */
export async function mountOnVehicle(warehouseItemId: string, input: MountOnVehicleInput): Promise<void> {
  const allocation = allocationToDbFields(input.vehicleKey);
  if (allocation.allocationType !== 'TRACTOR' && allocation.allocationType !== 'TRAILER') {
    throw new Error('Seleziona la targa (trattore o semirimorchio) su cui montare il pezzo.');
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error('Quantità da montare non valida.');
  }

  await prisma.$transaction(async (tx) => {
    const item = await tx.warehouseItem.findUnique({ where: { id: warehouseItemId } });
    if (!item) throw new Error('Articolo di magazzino non trovato.');
    if (input.quantity > item.quantity) {
      throw new Error(`Giacenza insufficiente: disponibili ${item.quantity} ${item.unit}.`);
    }

    const newQuantity = item.quantity - input.quantity;
    const amountCents = item.unitCostCents !== null ? item.unitCostCents * input.quantity : null;

    await tx.warehouseMovement.create({
      data: {
        warehouseItemId,
        type: 'UNLOAD',
        quantityMilli: input.quantity * 1000,
        unitCostCents: item.unitCostCents,
        amountCents,
        movementDate: input.movementDate,
        tractorId: allocation.tractorId,
        trailerId: allocation.trailerId,
        notes: input.notes
      }
    });

    await tx.warehouseItem.update({
      where: { id: warehouseItemId },
      data: { quantity: newQuantity, status: inferWarehouseStatus(newQuantity, item.minimumQuantity) }
    });
  });
}

export type AdjustStockInput = {
  deltaQuantity: number; // positivo = carico, negativo = scarico
  movementDate: Date;
  notes: string | null;
};

/** Rettifica manuale della giacenza (inventario), tracciata come movimento ADJUST. */
export async function adjustStock(warehouseItemId: string, input: AdjustStockInput): Promise<void> {
  if (!Number.isInteger(input.deltaQuantity) || input.deltaQuantity === 0) {
    throw new Error('Inserisci una variazione di quantità diversa da zero.');
  }

  await prisma.$transaction(async (tx) => {
    const item = await tx.warehouseItem.findUnique({ where: { id: warehouseItemId } });
    if (!item) throw new Error('Articolo di magazzino non trovato.');

    const newQuantity = item.quantity + input.deltaQuantity;
    if (newQuantity < 0) throw new Error('La rettifica porterebbe la giacenza sotto zero.');

    await tx.warehouseMovement.create({
      data: {
        warehouseItemId,
        type: 'ADJUST',
        quantityMilli: Math.abs(input.deltaQuantity) * 1000,
        unitCostCents: item.unitCostCents,
        amountCents: item.unitCostCents !== null ? item.unitCostCents * Math.abs(input.deltaQuantity) : null,
        movementDate: input.movementDate,
        notes: input.notes
      }
    });

    await tx.warehouseItem.update({
      where: { id: warehouseItemId },
      data: { quantity: newQuantity, status: inferWarehouseStatus(newQuantity, item.minimumQuantity) }
    });
  });
}
