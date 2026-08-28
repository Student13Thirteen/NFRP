/**
 * Complesso di lavoro: autista, mezzo a motore e semirimorchio.
 *
 * L'operatore apre una qualsiasi delle tre anagrafiche e deve leggere subito le
 * altre due. La coppia trattore-semirimorchio e un dato diretto
 * (`Trailer.assignedTractor`), mentre l'autista arriva sempre dalla assegnazione
 * a periodo del trattore: nessun collegamento viene dedotto o inventato, se il
 * periodo non esiste il gestionale lo dichiara.
 */
import { assignmentDateKey, getDriverAssignmentStatus } from '@/lib/driver-assignment-core';

export type PairingDriver = { firstName: string; lastName: string };
export type PairingPeriod = { validFrom: Date | string; validTo: Date | string | null };
export type PairingPlate = { plate: string };

export const NO_DRIVER_LABEL = 'Nessun autista assegnato';
export const NO_TRACTOR_LABEL = 'Nessun mezzo a motore abbinato';
export const NO_TRAILER_LABEL = 'Nessun semirimorchio abbinato';

/**
 * Periodo valido oggi nel fuso `Europe/Rome`, come le altre viste autista: due
 * periodi non possono sovrapporsi, ma se lo storico ne contenesse comunque piu
 * di uno vince il piu recente.
 */
export function findCurrentDriverAssignment<Assignment extends PairingPeriod>(
  assignments: Assignment[],
  today: Date | string = new Date()
): Assignment | null {
  return (
    [...assignments]
      .filter((assignment) => getDriverAssignmentStatus(assignment, today) === 'CURRENT')
      .sort((left, right) => assignmentDateKey(right.validFrom).localeCompare(assignmentDateKey(left.validFrom)))[0] || null
  );
}

/** Ordine gestionale: cognome e poi nome, come negli elenchi e nelle tendine. */
export function formatDriverName(driver: PairingDriver | null | undefined): string | null {
  if (!driver) return null;
  const name = `${driver.lastName} ${driver.firstName}`.replace(/\s+/g, ' ').trim();
  return name || null;
}

/**
 * Piu semirimorchi sullo stesso trattore restano permessi (vincolo morbido):
 * si mostrano tutte le targhe invece di sceglierne una arbitrariamente.
 */
export function formatPlateList(vehicles: PairingPlate[]): string | null {
  const plates = vehicles.map((vehicle) => vehicle.plate).filter(Boolean);
  return plates.length > 0 ? plates.join(', ') : null;
}
