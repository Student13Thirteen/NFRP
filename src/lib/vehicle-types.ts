import { MotorVehicleType, TankCargoType, TrailerBodyType } from '@prisma/client';

/**
 * Tipologie di flotta. La tipologia e volutamente facoltativa: un mezzo senza
 * classificazione resta "Da classificare" invece di ricevere un valore dedotto
 * da marca/modello e mai confermato da un operatore.
 */

export const UNCLASSIFIED_FILTER_VALUE = 'unclassified';

/** Ordine di lettura usato in filtri, tendine e riepiloghi. */
export const MOTOR_VEHICLE_TYPES = [
  MotorVehicleType.TRACTOR_UNIT,
  MotorVehicleType.RIGID_TRUCK,
  MotorVehicleType.VAN,
  MotorVehicleType.TRUCK,
  MotorVehicleType.CAR
] as const;

export const TRAILER_BODY_TYPES = [
  TrailerBodyType.CONTAINER,
  TrailerBodyType.TANK,
  TrailerBodyType.REEFER
] as const;

export const TANK_CARGO_TYPES = [TankCargoType.FUEL, TankCargoType.LPG] as const;

const MOTOR_VEHICLE_TYPE_LABELS: Record<MotorVehicleType, string> = {
  TRACTOR_UNIT: 'Trattore',
  RIGID_TRUCK: 'Motrice',
  VAN: 'Furgone',
  TRUCK: 'Autocarro',
  CAR: 'Autovettura'
};

/** Etichetta al plurale per titoli di pagina e chip di filtro. */
const MOTOR_VEHICLE_TYPE_PLURAL_LABELS: Record<MotorVehicleType, string> = {
  TRACTOR_UNIT: 'Trattori',
  RIGID_TRUCK: 'Motrici',
  VAN: 'Furgoni',
  TRUCK: 'Autocarri',
  CAR: 'Autovetture'
};

const TRAILER_BODY_TYPE_LABELS: Record<TrailerBodyType, string> = {
  CONTAINER: 'Container',
  TANK: 'Cisterna',
  REEFER: 'Frigo'
};

const TRAILER_BODY_TYPE_PLURAL_LABELS: Record<TrailerBodyType, string> = {
  CONTAINER: 'Container',
  TANK: 'Cisterne',
  REEFER: 'Frigo'
};

const TANK_CARGO_LABELS: Record<TankCargoType, string> = {
  FUEL: 'Benzina / Gasolio',
  LPG: 'GPL'
};

export const UNCLASSIFIED_LABEL = 'Da classificare';

export function getMotorVehicleTypeLabel(type: MotorVehicleType | null | undefined): string {
  return type ? MOTOR_VEHICLE_TYPE_LABELS[type] : UNCLASSIFIED_LABEL;
}

export function getMotorVehicleTypePluralLabel(type: MotorVehicleType): string {
  return MOTOR_VEHICLE_TYPE_PLURAL_LABELS[type];
}

export function getTrailerBodyTypeLabel(type: TrailerBodyType | null | undefined): string {
  return type ? TRAILER_BODY_TYPE_LABELS[type] : UNCLASSIFIED_LABEL;
}

export function getTrailerBodyTypePluralLabel(type: TrailerBodyType): string {
  return TRAILER_BODY_TYPE_PLURAL_LABELS[type];
}

export function getTankCargoLabel(cargo: TankCargoType | null | undefined): string {
  return cargo ? TANK_CARGO_LABELS[cargo] : 'Carico da precisare';
}

/**
 * Etichetta completa di un semirimorchio: la cisterna dichiara anche il carico,
 * perche una cisterna benzina/gasolio e una GPL non sono intercambiabili.
 */
export function getTrailerTypeLabel(trailer: {
  bodyType: TrailerBodyType | null;
  tankCargo: TankCargoType | null;
}): string {
  if (!trailer.bodyType) return UNCLASSIFIED_LABEL;
  if (trailer.bodyType !== TrailerBodyType.TANK) return TRAILER_BODY_TYPE_LABELS[trailer.bodyType];
  return `Cisterna ${trailer.tankCargo ? TANK_CARGO_LABELS[trailer.tankCargo] : '(carico da precisare)'}`;
}

/** Titolo della scheda mezzo: nomina la tipologia quando e nota, mai inventata. */
export function getMotorVehicleHeading(vehicle: { plate: string; vehicleType: MotorVehicleType | null }): string {
  return vehicle.vehicleType ? `${MOTOR_VEHICLE_TYPE_LABELS[vehicle.vehicleType]} ${vehicle.plate}` : `Mezzo ${vehicle.plate}`;
}

export function getTrailerHeading(trailer: {
  plate: string;
  bodyType: TrailerBodyType | null;
  tankCargo: TankCargoType | null;
}): string {
  if (!trailer.bodyType) return `Semirimorchio ${trailer.plate}`;
  return `Semirimorchio ${getTrailerTypeLabel(trailer).toLocaleLowerCase('it-IT')} ${trailer.plate}`;
}

/** Classe badge: la tipologia e informativa, non uno stato operativo. */
export function getVehicleTypeBadgeClass(classified: boolean): string {
  return classified ? 'vehicle-type-badge' : 'vehicle-type-badge unclassified';
}

export function parseMotorVehicleType(value: string | null | undefined): MotorVehicleType | null {
  if (!value) return null;
  const candidate = MOTOR_VEHICLE_TYPES.find((type) => type === value);
  if (!candidate) throw new Error('Tipologia mezzo non valida.');
  return candidate;
}

export function parseTrailerBodyType(value: string | null | undefined): TrailerBodyType | null {
  if (!value) return null;
  const candidate = TRAILER_BODY_TYPES.find((type) => type === value);
  if (!candidate) throw new Error('Tipologia semirimorchio non valida.');
  return candidate;
}

/** Il carico ha senso solo sulle cisterne: fuori da li viene azzerato. */
export function parseTankCargo(value: string | null | undefined, bodyType: TrailerBodyType | null): TankCargoType | null {
  if (bodyType !== TrailerBodyType.TANK) return null;
  if (!value) return null;
  const candidate = TANK_CARGO_TYPES.find((cargo) => cargo === value);
  if (!candidate) throw new Error('Carico cisterna non valido.');
  return candidate;
}

export type MotorVehicleTypeFilter = MotorVehicleType | typeof UNCLASSIFIED_FILTER_VALUE | null;
export type TrailerBodyTypeFilter = TrailerBodyType | typeof UNCLASSIFIED_FILTER_VALUE | null;

export function parseMotorVehicleTypeFilter(value: string | null | undefined): MotorVehicleTypeFilter {
  if (!value) return null;
  if (value === UNCLASSIFIED_FILTER_VALUE) return UNCLASSIFIED_FILTER_VALUE;
  return MOTOR_VEHICLE_TYPES.find((type) => type === value) || null;
}

export function parseTrailerBodyTypeFilter(value: string | null | undefined): TrailerBodyTypeFilter {
  if (!value) return null;
  if (value === UNCLASSIFIED_FILTER_VALUE) return UNCLASSIFIED_FILTER_VALUE;
  return TRAILER_BODY_TYPES.find((type) => type === value) || null;
}

export function parseTankCargoFilter(value: string | null | undefined): TankCargoType | null {
  if (!value) return null;
  return TANK_CARGO_TYPES.find((cargo) => cargo === value) || null;
}

export function matchesMotorVehicleTypeFilter(
  vehicle: { vehicleType: MotorVehicleType | null },
  filter: MotorVehicleTypeFilter
): boolean {
  if (!filter) return true;
  if (filter === UNCLASSIFIED_FILTER_VALUE) return vehicle.vehicleType === null;
  return vehicle.vehicleType === filter;
}

export function matchesTrailerTypeFilter(
  trailer: { bodyType: TrailerBodyType | null; tankCargo: TankCargoType | null },
  filter: TrailerBodyTypeFilter,
  cargoFilter: TankCargoType | null = null
): boolean {
  if (!filter) return true;
  if (filter === UNCLASSIFIED_FILTER_VALUE) return trailer.bodyType === null;
  if (trailer.bodyType !== filter) return false;
  if (filter !== TrailerBodyType.TANK || !cargoFilter) return true;
  return trailer.tankCargo === cargoFilter;
}
