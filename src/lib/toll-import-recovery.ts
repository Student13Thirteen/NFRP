import { TollEntryStatus } from '@prisma/client';

export type ExistingTollImportEntry = {
  importBatchId: string | null;
  sourceKey: string;
  status: TollEntryStatus;
};

export type TollDuplicateRecoverySummary = {
  allRowsAlreadyPresent: boolean;
  recoverableBatchIds: string[];
  recoverableDiscardedRows: number;
};

export function summarizeTollDuplicateRecovery(
  parsedSourceKeys: string[],
  existingEntries: ExistingTollImportEntry[]
): TollDuplicateRecoverySummary {
  const existingBySourceKey = new Map(existingEntries.map((entry) => [entry.sourceKey, entry]));
  const discardedRows = parsedSourceKeys
    .map((sourceKey) => existingBySourceKey.get(sourceKey))
    .filter((entry): entry is ExistingTollImportEntry => entry?.status === TollEntryStatus.DISCARDED);

  return {
    allRowsAlreadyPresent:
      parsedSourceKeys.length > 0 && parsedSourceKeys.every((sourceKey) => existingBySourceKey.has(sourceKey)),
    recoverableBatchIds: Array.from(new Set(
      discardedRows.map((entry) => entry.importBatchId).filter((batchId): batchId is string => Boolean(batchId))
    )),
    recoverableDiscardedRows: discardedRows.length
  };
}
