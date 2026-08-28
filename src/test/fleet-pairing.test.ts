import { describe, expect, it } from 'vitest';
import { findCurrentDriverAssignment, formatDriverName, formatPlateList } from '@/lib/fleet-pairing';

const rossi = { firstName: 'Mario', lastName: 'Rossi' };
const bianchi = { firstName: 'Luca', lastName: 'Bianchi' };

describe('complesso autista, mezzo e semirimorchio', () => {
  it('sceglie il periodo valido oggi e ignora quelli chiusi o futuri', () => {
    const assignments = [
      { validFrom: '2026-09-01', validTo: null, driver: bianchi },
      { validFrom: '2026-08-01', validTo: null, driver: rossi },
      { validFrom: '2026-01-01', validTo: '2026-07-31', driver: bianchi }
    ];

    expect(findCurrentDriverAssignment(assignments, '2026-08-28')?.driver).toBe(rossi);
    expect(findCurrentDriverAssignment(assignments, '2026-09-10')?.driver).toBe(bianchi);
    expect(findCurrentDriverAssignment(assignments, '2026-07-15')?.driver).toBe(bianchi);
  });

  it('non inventa un autista quando nessun periodo copre la data', () => {
    const assignments = [{ validFrom: '2026-01-01', validTo: '2026-06-30', driver: rossi }];

    expect(findCurrentDriverAssignment(assignments, '2026-08-28')).toBeNull();
    expect(findCurrentDriverAssignment([], '2026-08-28')).toBeNull();
  });

  it('se lo storico contenesse due periodi aperti sceglie il piu recente', () => {
    const assignments = [
      { validFrom: '2026-08-20', validTo: null, driver: bianchi },
      { validFrom: '2026-08-01', validTo: null, driver: rossi }
    ];

    expect(findCurrentDriverAssignment(assignments, '2026-08-28')?.driver).toBe(bianchi);
  });

  it('non modifica l ordine dell elenco ricevuto', () => {
    const assignments = [
      { validFrom: '2026-08-01', validTo: null, driver: rossi },
      { validFrom: '2026-08-20', validTo: null, driver: bianchi }
    ];
    findCurrentDriverAssignment(assignments, '2026-08-28');

    expect(assignments[0].driver).toBe(rossi);
  });

  it('scrive il nome autista come negli elenchi, cognome davanti', () => {
    expect(formatDriverName(rossi)).toBe('Rossi Mario');
    expect(formatDriverName(null)).toBeNull();
    expect(formatDriverName({ firstName: '', lastName: '' })).toBeNull();
  });

  it('elenca tutte le targhe abbinate senza sceglierne una sola', () => {
    expect(formatPlateList([{ plate: 'AB123CD' }, { plate: 'EF456GH' }])).toBe('AB123CD, EF456GH');
    expect(formatPlateList([])).toBeNull();
  });
});
