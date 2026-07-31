'use server';

import { EntityType } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { buildEntityRelation } from '@/lib/documents';
import { setFlashMessage } from '@/lib/flash';

const checklistTargetSchema = z.object({
  entityType: z.nativeEnum(EntityType),
  entityId: z.string().min(1),
  documentTypeId: z.string().min(1)
});

type ChecklistTarget = z.infer<typeof checklistTargetSchema>;

function parseChecklistTarget(entityType: EntityType, entityId: string, documentTypeId: string): ChecklistTarget {
  return checklistTargetSchema.parse({ entityType, entityId, documentTypeId });
}

function getEntityPath(entityType: EntityType, entityId: string): string {
  switch (entityType) {
    case EntityType.DRIVER:
      return `/drivers/${entityId}`;
    case EntityType.TRACTOR:
      return `/vehicles/tractors/${entityId}`;
    case EntityType.TRAILER:
      return `/vehicles/trailers/${entityId}`;
    case EntityType.OTHER:
      return `/others/${entityId}`;
  }
}

async function assertEntityExists(target: ChecklistTarget) {
  switch (target.entityType) {
    case EntityType.DRIVER:
      if (await prisma.driver.findUnique({ where: { id: target.entityId }, select: { id: true } })) return;
      throw new Error('Autista non valido.');
    case EntityType.TRACTOR:
      if (await prisma.tractor.findUnique({ where: { id: target.entityId }, select: { id: true } })) return;
      throw new Error('Trattore non valido.');
    case EntityType.TRAILER:
      if (await prisma.trailer.findUnique({ where: { id: target.entityId }, select: { id: true } })) return;
      throw new Error('Semirimorchio non valido.');
    case EntityType.OTHER:
      if (await prisma.otherEntity.findUnique({ where: { id: target.entityId }, select: { id: true } })) return;
      throw new Error('Entita non valida.');
  }
}

function getExclusionFilter(target: ChecklistTarget) {
  return {
    documentTypeId: target.documentTypeId,
    entityType: target.entityType,
    ...buildEntityRelation(target.entityType, target.entityId)
  };
}

export async function excludeChecklistDocumentAction(entityType: EntityType, entityId: string, documentTypeId: string) {
  const target = parseChecklistTarget(entityType, entityId, documentTypeId);
  const documentType = await prisma.documentType.findUnique({
    where: { id: target.documentTypeId },
    select: { active: true, suggestedEntityType: true }
  });

  if (!documentType || !documentType.active || documentType.suggestedEntityType !== target.entityType) {
    throw new Error('Tipo documento non valido per questa checklist.');
  }

  await assertEntityExists(target);

  const existingExclusion = await prisma.documentRequirementExclusion.findFirst({
    where: getExclusionFilter(target),
    select: { id: true }
  });

  if (!existingExclusion) {
    await prisma.documentRequirementExclusion.create({
      data: getExclusionFilter(target)
    });
  }

  revalidatePath(getEntityPath(target.entityType, target.entityId));
  await setFlashMessage({
    type: 'success',
    title: 'Checklist aggiornata',
    message: 'Il documento e stato segnato come non richiesto.'
  });
}

export async function restoreChecklistDocumentAction(entityType: EntityType, entityId: string, documentTypeId: string) {
  const target = parseChecklistTarget(entityType, entityId, documentTypeId);

  await prisma.documentRequirementExclusion.deleteMany({
    where: getExclusionFilter(target)
  });

  revalidatePath(getEntityPath(target.entityType, target.entityId));
  await setFlashMessage({
    type: 'success',
    title: 'Checklist aggiornata',
    message: 'Il documento e tornato tra quelli richiesti.'
  });
}
