import { EntityType } from '@prisma/client';

type VehicleEntityType = typeof EntityType.TRACTOR | typeof EntityType.TRAILER;

export type BarratoRosaExpiryReference = {
  entityType: VehicleEntityType;
  entityId: string;
  label: string;
  expiryDate: Date;
};

type VehicleEntityReference = {
  entityType: EntityType;
  entityId: string;
};

export type InboxExpiryOverride = {
  expiryDate: Date;
  evidence: string;
};

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function isVehicleEntity(entity: VehicleEntityReference | null): entity is VehicleEntityReference & { entityType: VehicleEntityType } {
  return Boolean(entity && (entity.entityType === EntityType.TRACTOR || entity.entityType === EntityType.TRAILER));
}

export function findBarratoRosaLibrettoExpiryOverride(
  documentTypeName: string | null,
  entity: VehicleEntityReference | null,
  barratoRosaExpiries: BarratoRosaExpiryReference[],
  now: Date = new Date()
): InboxExpiryOverride | null {
  if (!documentTypeName || !normalize(documentTypeName).includes('libretto') || !isVehicleEntity(entity)) {
    return null;
  }

  const reference = barratoRosaExpiries
    .filter((expiry) => expiry.entityType === entity.entityType && expiry.entityId === entity.entityId)
    .sort((a, b) => b.expiryDate.getTime() - a.expiryDate.getTime())[0];

  if (!reference) return null;

  // Una scadenza barrato rosa GIA' SCADUTA non deve dettare la scadenza del libretto/revisione: meglio
  // lasciare il talloncino o l'inserimento manuale. Evita di "ereditare" la data del vecchio barrato rosa
  // quando se ne sta caricando uno nuovo per la stessa targa.
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (reference.expiryDate.getTime() < todayUtc) return null;

  return {
    expiryDate: reference.expiryDate,
    evidence: `Barrato rosa più recente per ${reference.label}: scadenza allineata al libretto/revisione.`
  };
}
