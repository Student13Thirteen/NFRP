import { describe, expect, it, vi } from 'vitest';
import {
  parseConfirmedExpenseDetails,
  parseExpenseLines,
  resolveExpenseAllocationDriverIds
} from '@/lib/expense-form';

function maintenanceSplitForm(secondQuantity = '1'): FormData {
  const formData = new FormData();
  formData.append('lineKey', 'line-0');
  formData.append('lineDescription', 'Pneumatico');
  formData.append('lineCode', 'PNEU-01');
  formData.append('lineQuantity', '2');
  formData.append('lineUnit', 'pz');
  formData.append('lineUnitPrice', '290.000');
  formData.append('lineVatRate', '22');
  formData.append('lineCategoryId', '');

  formData.append('lineAllocationLineKey', 'line-0');
  formData.append('lineAllocationQuantity', '1');
  formData.append('lineAllocationKey', 'WAREHOUSE');
  formData.append('lineAllocationOdometerKm', '');

  formData.append('lineAllocationLineKey', 'line-0');
  formData.append('lineAllocationQuantity', secondQuantity);
  formData.append('lineAllocationKey', 'TRACTOR:tractor-1');
  formData.append('lineAllocationOdometerKm', '260778');
  return formData;
}

describe('parseExpenseLines con ripartizione manutenzioni', () => {
  it('mantiene una sola riga contabile e crea due quote di destinazione', () => {
    const [line] = parseExpenseLines(maintenanceSplitForm());

    expect(line.quantityMilli).toBe(2000);
    expect(line.imponibileCents).toBe(58000);
    expect(line.totalCents).toBe(70760);
    expect(line.allocationType).toBe('GENERIC');
    expect(line.tractorId).toBeNull();
    expect(line.allocations).toEqual([
      {
        position: 0,
        quantityMilli: 1000,
        allocationType: 'WAREHOUSE',
        tractorId: null,
        trailerId: null,
        odometerKm: null,
        driverSelection: 'AUTO',
        driverId: null
      },
      {
        position: 1,
        quantityMilli: 1000,
        allocationType: 'TRACTOR',
        tractorId: 'tractor-1',
        trailerId: null,
        odometerKm: 260778,
        driverSelection: 'AUTO',
        driverId: null
      }
    ]);
  });

  it('blocca la conferma quando la somma assegnata non coincide', () => {
    expect(() => parseExpenseLines(maintenanceSplitForm('0,5'))).toThrow(
      'la somma delle quantità assegnate deve coincidere'
    );
  });

  it('mantiene targhe diverse scelte sulle singole righe senza assegnazione massiva', () => {
    const formData = new FormData();
    for (const [index, tractorId] of ['tractor-a', 'tractor-b'].entries()) {
      const lineKey = `line-${index}`;
      formData.append('lineKey', lineKey);
      formData.append('lineDescription', `Operazione ${index + 1}`);
      formData.append('lineCode', '');
      formData.append('lineQuantity', '1');
      formData.append('lineUnit', 'pz');
      formData.append('lineUnitPrice', '100.000');
      formData.append('lineVatRate', '22');
      formData.append('lineCategoryId', '');
      formData.append('lineAllocationLineKey', lineKey);
      formData.append('lineAllocationQuantity', '1');
      formData.append('lineAllocationKey', `TRACTOR:${tractorId}`);
      formData.append('lineAllocationOdometerKm', '');
    }

    const lines = parseExpenseLines(formData);

    expect(lines.map((line) => line.tractorId)).toEqual(['tractor-a', 'tractor-b']);
    expect(lines.map((line) => line.allocations[0].tractorId)).toEqual(['tractor-a', 'tractor-b']);
  });

  it('accetta prezzi a tre decimali con il punto e calcola il totale senza perdere precisione', () => {
    const formData = new FormData();
    formData.append('lineKey', 'line-0');
    formData.append('lineDescription', 'Liquido tecnico');
    formData.append('lineQuantity', '5');
    formData.append('lineUnit', 'l');
    formData.append('lineUnitPrice', '3.312');
    formData.append('lineVatRate', '22');
    formData.append('lineAllocationLineKey', 'line-0');
    formData.append('lineAllocationQuantity', '5');
    formData.append('lineAllocationKey', 'TRACTOR:tractor-1');

    const [line] = parseExpenseLines(formData);

    expect(line.unitPriceMilliEuro).toBe(3312);
    expect(line.unitPriceCents).toBe(331);
    expect(line.imponibileCents).toBe(1656);
    expect(line.totalCents).toBe(2020);
  });
});

describe('parseConfirmedExpenseDetails', () => {
  it('accetta soltanto integrazioni testuali abbinate alle righe esistenti', () => {
    const formData = new FormData();
    formData.set('expectedUpdatedAt', '2026-08-18T08:30:00.000Z');
    formData.set('notes', '  PDF ricevuto in seguito  ');
    formData.append('lineId', 'line-a');
    formData.append('lineDescription', '  Sostituzione filtro olio  ');
    formData.append('lineCode', ' FO-1 ');
    formData.append('lineNotes', ' Controllato serraggio ');

    expect(parseConfirmedExpenseDetails(formData)).toEqual({
      expectedUpdatedAt: new Date('2026-08-18T08:30:00.000Z'),
      notes: 'PDF ricevuto in seguito',
      lines: [{
        id: 'line-a',
        description: 'Sostituzione filtro olio',
        code: 'FO-1',
        notes: 'Controllato serraggio'
      }],
      allocations: []
    });
  });

  it('rifiuta una scheda incompleta invece di perdere dettagli di una riga', () => {
    const formData = new FormData();
    formData.set('expectedUpdatedAt', '2026-08-18T08:30:00.000Z');
    formData.append('lineId', 'line-a');
    formData.append('lineDescription', 'Intervento');
    formData.append('lineCode', '');

    expect(() => parseConfirmedExpenseDetails(formData)).toThrow('righe del documento non sono complete');
  });
});

describe('risoluzione server autista manutenzione', () => {
  it('per il semirimorchio usa il trattore associato e il periodo valido alla data', async () => {
    const client = {
      driver: { findMany: vi.fn() },
      trailer: {
        findMany: vi.fn().mockResolvedValue([{ id: 'trailer-1', assignedTractorId: 'tractor-1' }])
      },
      tractorDriverAssignment: {
        findMany: vi.fn().mockResolvedValue([{ tractorId: 'tractor-1', driverId: 'driver-1' }])
      }
    } as never;

    await expect(resolveExpenseAllocationDriverIds([{
      allocationType: 'TRAILER',
      tractorId: null,
      trailerId: 'trailer-1',
      driverSelection: 'AUTO'
    }], new Date('2026-08-18T00:00:00.000Z'), client)).resolves.toEqual(['driver-1']);
  });
});
