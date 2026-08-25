import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { optionalFormString } from '@/lib/form';

type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient;

export type VehicleOwnerOption = {
  id: string;
  name: string;
  active: boolean;
};

export function normalizeVehicleOwnerName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 160);
}

/**
 * Un proprietario scritto a mano non deve creare doppioni: un omonimo (anche
 * scritto con maiuscole diverse) viene riusato e, se disattivato, riattivato.
 */
export async function findOrCreateVehicleOwner(client: PrismaClientOrTx, rawName: string) {
  const name = normalizeVehicleOwnerName(rawName);
  if (!name) throw new Error('Nome proprietario obbligatorio.');

  const existing = await client.vehicleOwner.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true, name: true, active: true }
  });
  if (existing) {
    if (existing.active) return existing;
    return client.vehicleOwner.update({
      where: { id: existing.id },
      data: { active: true },
      select: { id: true, name: true, active: true }
    });
  }

  try {
    return await client.vehicleOwner.create({ data: { name }, select: { id: true, name: true, active: true } });
  } catch (error) {
    // Corsa fra due salvataggi con lo stesso nome: vince il record gia scritto.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const raced = await client.vehicleOwner.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
        select: { id: true, name: true, active: true }
      });
      if (raced) return raced;
    }
    throw error;
  }
}

/**
 * Risolve il proprietario da un form: prima la scelta in tendina, poi il nome
 * digitato al volo. Restituisce `null` quando l'operatore non lo indica: il
 * proprietario resta un dato utile, non un obbligo che blocca il salvataggio.
 */
export async function resolveVehicleOwnerIdFromForm(
  formData: FormData,
  fields: { idField: string; nameField: string },
  client: PrismaClientOrTx = prisma
): Promise<string | null> {
  const selectedId = optionalFormString(formData, fields.idField);
  if (selectedId) {
    const owner = await client.vehicleOwner.findUnique({ where: { id: selectedId }, select: { id: true } });
    if (!owner) throw new Error('Proprietario selezionato non valido.');
    return owner.id;
  }

  const typedName = optionalFormString(formData, fields.nameField);
  if (!typedName) return null;
  const owner = await findOrCreateVehicleOwner(client, typedName);
  return owner.id;
}

export async function listVehicleOwnerOptions(): Promise<VehicleOwnerOption[]> {
  return prisma.vehicleOwner.findMany({
    select: { id: true, name: true, active: true },
    orderBy: [{ active: 'desc' }, { name: 'asc' }]
  });
}
