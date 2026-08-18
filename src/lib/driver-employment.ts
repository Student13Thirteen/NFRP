import 'server-only';

import { DriverEmploymentEndReason, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { parseDriverAssignmentDate } from '@/lib/driver-assignments';

type EmploymentInput = {
  driverId: string;
  startDate: Date;
  endDate: Date | null;
  endReason: DriverEmploymentEndReason | null;
  notes: string | null;
};

export function parseDriverEmploymentInput(driverId: string, formData: FormData): EmploymentInput {
  const startDate = parseDriverAssignmentDate(String(formData.get('startDate') || ''), 'Data assunzione');
  const endDate = parseDriverAssignmentDate(String(formData.get('endDate') || ''), 'Data cessazione', false);
  if (!startDate) throw new Error('Data assunzione obbligatoria.');
  if (endDate && endDate < startDate) throw new Error('La data di cessazione non puo essere precedente all’assunzione.');

  const rawReason = String(formData.get('endReason') || '').trim();
  const endReason = rawReason
    ? Object.values(DriverEmploymentEndReason).includes(rawReason as DriverEmploymentEndReason)
      ? rawReason as DriverEmploymentEndReason
      : null
    : null;
  if (rawReason && !endReason) throw new Error('Causale di cessazione non valida.');
  if (endDate && !endReason) throw new Error('Se indichi la data di cessazione, seleziona anche la causale.');
  if (!endDate && endReason) throw new Error('La causale richiede anche la data di cessazione.');

  const notes = String(formData.get('employmentNotes') || '').trim() || null;
  if (notes && notes.length > 2000) throw new Error('Le note del rapporto di lavoro sono troppo lunghe.');
  return { driverId, startDate, endDate, endReason, notes };
}

async function assertEmploymentPeriodAvailable(
  tx: Prisma.TransactionClient,
  input: EmploymentInput,
  excludeId?: string
) {
  const driver = await tx.driver.findUnique({ where: { id: input.driverId }, select: { id: true } });
  if (!driver) throw new Error('Autista non trovato.');
  const overlap = await tx.driverEmploymentPeriod.findFirst({
    where: {
      driverId: input.driverId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startDate: { lte: input.endDate || new Date('9999-12-31T00:00:00.000Z') },
      OR: [{ endDate: null }, { endDate: { gte: input.startDate } }]
    },
    orderBy: { startDate: 'asc' }
  });
  if (overlap) throw new Error('Il periodo si sovrappone a un rapporto di lavoro gia registrato. Modifica o chiudi prima quello esistente.');
}

export async function createDriverEmploymentPeriod(input: EmploymentInput) {
  return prisma.$transaction(async (tx) => {
    await assertEmploymentPeriodAvailable(tx, input);
    return tx.driverEmploymentPeriod.create({ data: input });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateDriverEmploymentPeriod(id: string, input: EmploymentInput) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.driverEmploymentPeriod.findUnique({ where: { id } });
    if (!current || current.driverId !== input.driverId) throw new Error('Periodo di lavoro non trovato.');
    await assertEmploymentPeriodAvailable(tx, input, id);
    return tx.driverEmploymentPeriod.update({ where: { id }, data: input });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function deleteDriverEmploymentPeriod(id: string, driverId: string) {
  const period = await prisma.driverEmploymentPeriod.findUnique({ where: { id }, select: { driverId: true } });
  if (!period || period.driverId !== driverId) throw new Error('Periodo di lavoro non trovato.');
  await prisma.driverEmploymentPeriod.delete({ where: { id } });
}
