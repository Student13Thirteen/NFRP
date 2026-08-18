import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { assignmentDateKey, findDatedDriverAssignment } from '@/lib/driver-assignment-core';

type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient;

type AssignmentInput = {
  tractorId: string;
  driverId: string;
  validFrom: Date;
  validTo: Date | null;
  notes: string | null;
};

export function parseDriverAssignmentDate(value: string, label: string, required = true): Date | null {
  const normalized = value.trim();
  if (!normalized) {
    if (required) throw new Error(`${label} obbligatoria.`);
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) throw new Error(`${label} non valida.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${label} non valida.`);
  }
  return date;
}

export function parseDriverAssignmentPeriod(input: {
  validFrom: string;
  validTo: string;
}): { validFrom: Date; validTo: Date | null } {
  const validFrom = parseDriverAssignmentDate(input.validFrom, 'Data inizio');
  const validTo = parseDriverAssignmentDate(input.validTo, 'Data fine', false);
  if (!validFrom) throw new Error('Data inizio obbligatoria.');
  if (validTo && validTo < validFrom) {
    throw new Error('La data fine non puo essere precedente alla data inizio.');
  }
  return { validFrom, validTo };
}

function previousUtcDay(value: Date): Date {
  const previous = new Date(value);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous;
}

async function assertReferences(tx: PrismaClientOrTx, input: Pick<AssignmentInput, 'tractorId' | 'driverId'>) {
  const [tractor, driver] = await Promise.all([
    tx.tractor.findUnique({ where: { id: input.tractorId }, select: { id: true } }),
    tx.driver.findUnique({ where: { id: input.driverId }, select: { id: true } })
  ]);
  if (!tractor) throw new Error('Trattore non valido.');
  if (!driver) throw new Error('Autista non valido.');
}

async function getOverlappingAssignments(
  tx: PrismaClientOrTx,
  input: Pick<AssignmentInput, 'tractorId' | 'driverId' | 'validFrom' | 'validTo'>,
  excludeId?: string
) {
  return tx.tractorDriverAssignment.findMany({
    where: {
      AND: [
        ...(excludeId ? [{ id: { not: excludeId } }] : []),
        { validFrom: { lte: input.validTo || new Date('9999-12-31T00:00:00.000Z') } },
        { OR: [{ validTo: null }, { validTo: { gte: input.validFrom } }] },
        { OR: [{ tractorId: input.tractorId }, { driverId: input.driverId }] }
      ]
    },
    include: {
      tractor: { select: { plate: true } },
      driver: { select: { firstName: true, lastName: true } }
    },
    orderBy: { validFrom: 'asc' }
  });
}

function overlapMessage(
  assignment: Awaited<ReturnType<typeof getOverlappingAssignments>>[number],
  input: Pick<AssignmentInput, 'tractorId'>
): string {
  const period = `${assignmentDateKey(assignment.validFrom)}${assignment.validTo ? ` / ${assignmentDateKey(assignment.validTo)}` : ' / senza fine'}`;
  if (assignment.tractorId === input.tractorId) {
    const driver = `${assignment.driver.lastName} ${assignment.driver.firstName}`.trim();
    return `Il trattore ha gia ${driver} nel periodo ${period}. Modifica o chiudi prima quell'associazione.`;
  }
  return `L'autista risulta gia associato al trattore ${assignment.tractor.plate} nel periodo ${period}.`;
}

export async function syncLegacyAssignedDriver(
  tx: PrismaClientOrTx,
  tractorId: string,
  today: Date = new Date()
) {
  const referenceDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const current = await tx.tractorDriverAssignment.findFirst({
    where: {
      tractorId,
      validFrom: { lte: referenceDate },
      OR: [{ validTo: null }, { validTo: { gte: referenceDate } }]
    },
    orderBy: { validFrom: 'desc' },
    select: { driverId: true }
  });
  await tx.tractor.update({ where: { id: tractorId }, data: { assignedDriverId: current?.driverId || null } });
}

export async function createDriverAssignmentInTransaction(
  tx: Prisma.TransactionClient,
  input: AssignmentInput,
  options: { closeOpenAssignments?: boolean } = {}
) {
  await assertReferences(tx, input);
  let overlaps = await getOverlappingAssignments(tx, input);
  const closedTractorIds = new Set<string>();

  if (options.closeOpenAssignments) {
    const closable = overlaps.filter(
      (assignment) => assignment.validTo === null && assignment.validFrom < input.validFrom
    );
    for (const assignment of closable) {
      await tx.tractorDriverAssignment.update({
        where: { id: assignment.id },
        data: { validTo: previousUtcDay(input.validFrom) }
      });
      closedTractorIds.add(assignment.tractorId);
    }
    overlaps = await getOverlappingAssignments(tx, input);
  }

  if (overlaps.length > 0) throw new Error(overlapMessage(overlaps[0], input));
  const assignment = await tx.tractorDriverAssignment.create({ data: input });
  const affectedTractors = new Set([input.tractorId, ...closedTractorIds]);
  for (const tractorId of affectedTractors) await syncLegacyAssignedDriver(tx, tractorId);
  return assignment;
}

export async function createDriverAssignment(
  input: AssignmentInput,
  options: { closeOpenAssignments?: boolean } = {}
) {
  return prisma.$transaction(
    (tx) => createDriverAssignmentInTransaction(tx, input, options),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

export async function updateDriverAssignment(id: string, input: AssignmentInput) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.tractorDriverAssignment.findUnique({ where: { id } });
    if (!current || current.tractorId !== input.tractorId) throw new Error('Associazione non trovata.');
    await assertReferences(tx, input);
    const overlaps = await getOverlappingAssignments(tx, input, id);
    if (overlaps.length > 0) throw new Error(overlapMessage(overlaps[0], input));
    const assignment = await tx.tractorDriverAssignment.update({ where: { id }, data: input });
    await syncLegacyAssignedDriver(tx, input.tractorId);
    return assignment;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function deleteDriverAssignment(id: string, tractorId: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.tractorDriverAssignment.findUnique({ where: { id } });
    if (!current || current.tractorId !== tractorId) throw new Error('Associazione non trovata.');
    await tx.tractorDriverAssignment.delete({ where: { id } });
    await syncLegacyAssignedDriver(tx, tractorId);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getDriverIdForTractorAtDate(
  tx: PrismaClientOrTx,
  tractorId: string,
  date: Date
): Promise<string | null> {
  const assignment = await tx.tractorDriverAssignment.findFirst({
    where: {
      tractorId,
      validFrom: { lte: date },
      OR: [{ validTo: null }, { validTo: { gte: date } }]
    },
    orderBy: { validFrom: 'desc' },
    select: { driverId: true }
  });
  return assignment?.driverId || null;
}

export async function getDatedDriverMap(
  tx: PrismaClientOrTx,
  tractorIds: string[],
  dates: Date[]
): Promise<Map<string, string>> {
  if (tractorIds.length === 0 || dates.length === 0) return new Map();
  const minDate = new Date(Math.min(...dates.map((date) => date.getTime())));
  const maxDate = new Date(Math.max(...dates.map((date) => date.getTime())));
  const assignments = await tx.tractorDriverAssignment.findMany({
    where: {
      tractorId: { in: tractorIds },
      validFrom: { lte: maxDate },
      OR: [{ validTo: null }, { validTo: { gte: minDate } }]
    },
    select: { id: true, tractorId: true, driverId: true, validFrom: true, validTo: true }
  });

  const result = new Map<string, string>();
  for (const tractorId of tractorIds) {
    for (const date of dates) {
      const assignment = findDatedDriverAssignment(assignments, tractorId, date);
      if (assignment) result.set(`${tractorId}|${assignmentDateKey(date)}`, assignment.driverId);
    }
  }
  return result;
}
