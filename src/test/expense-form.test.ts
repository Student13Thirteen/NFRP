import { describe, expect, it } from 'vitest';
import { parseExpenseLines } from '@/lib/expense-form';

function maintenanceSplitForm(secondQuantity = '1'): FormData {
  const formData = new FormData();
  formData.append('lineKey', 'line-0');
  formData.append('lineDescription', 'Pneumatico');
  formData.append('lineCode', 'PNEU-01');
  formData.append('lineQuantity', '2');
  formData.append('lineUnit', 'pz');
  formData.append('lineUnitPrice', '290,00');
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
        odometerKm: null
      },
      {
        position: 1,
        quantityMilli: 1000,
        allocationType: 'TRACTOR',
        tractorId: 'tractor-1',
        trailerId: null,
        odometerKm: 260778
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
      formData.append('lineUnitPrice', '100,00');
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
});
