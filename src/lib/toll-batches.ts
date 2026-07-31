import { TollEntryStatus, type TollImportBatch } from '@prisma/client';
import { prisma } from '@/lib/db';

export type TollBatchState = 'pending' | 'needs_review' | 'confirmed' | 'discarded';

export type TollBatchSummary = TollImportBatch & {
  confirmedCount: number;
  distanceKm: number;
  entryCount: number;
  firstTollDate: Date | null;
  lastTollDate: Date | null;
  pendingCount: number;
  reviewCount: number;
  storedNetCents: number;
  storedVatCents: number;
  storedGrossCents: number;
};

type TollBatchSummaryOptions = {
  pendingOnly?: boolean;
};

export function getTollBatchState(batch: Pick<TollBatchSummary, 'entryCount' | 'pendingCount' | 'reviewCount'>): TollBatchState {
  if (batch.entryCount === 0) return 'discarded';
  if (batch.pendingCount > 0) return 'pending';
  if (batch.reviewCount > 0) return 'needs_review';
  return 'confirmed';
}

export function getTollBatchStateLabel(state: TollBatchState): string {
  switch (state) {
    case 'pending':
      return 'Da confermare';
    case 'needs_review':
      return 'Con avvisi';
    case 'confirmed':
      return 'Confermato';
    case 'discarded':
      return 'Scartato';
  }
}

export function tollBatchMatchesSearch(
  batch: Pick<TollBatchSummary, 'customerCode' | 'invoiceNumber' | 'originalFileName' | 'providerName'>,
  query: string | undefined
): boolean {
  const tokens = (query || '')
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;

  const text = [batch.originalFileName, batch.invoiceNumber || '', batch.providerName, batch.customerCode || '']
    .join(' ')
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  return tokens.every((token) => text.includes(token));
}

export async function getTollBatchSummaries(options: TollBatchSummaryOptions = {}): Promise<TollBatchSummary[]> {
  const entryWhere = {
    importBatchId: { not: null },
    ...(options.pendingOnly ? { status: TollEntryStatus.PENDING } : {})
  } as const;

  const [batches, totals, statusCounts, reviewCounts] = await Promise.all([
    prisma.tollImportBatch.findMany({ orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }] }),
    prisma.tollEntry.groupBy({
      by: ['importBatchId'],
      where: entryWhere,
      _count: { _all: true },
      _sum: { distanceKm: true, netAmountCents: true, vatAmountCents: true, grossAmountCents: true },
      _min: { tollDate: true },
      _max: { tollDate: true }
    }),
    prisma.tollEntry.groupBy({
      by: ['importBatchId', 'status'],
      where: entryWhere,
      _count: { _all: true }
    }),
    prisma.tollEntry.groupBy({
      by: ['importBatchId'],
      where: { ...entryWhere, reviewReasons: { not: null } },
      _count: { _all: true }
    })
  ]);

  const totalsByBatch = new Map(totals.map((total) => [total.importBatchId, total]));
  const reviewByBatch = new Map(reviewCounts.map((count) => [count.importBatchId, count._count._all]));
  const statusByBatch = new Map<string, Map<TollEntryStatus, number>>();
  for (const statusCount of statusCounts) {
    if (!statusCount.importBatchId) continue;
    const counts = statusByBatch.get(statusCount.importBatchId) || new Map<TollEntryStatus, number>();
    counts.set(statusCount.status, statusCount._count._all);
    statusByBatch.set(statusCount.importBatchId, counts);
  }

  return batches
    .map((batch) => {
      const total = totalsByBatch.get(batch.id);
      const counts = statusByBatch.get(batch.id);
      return {
        ...batch,
        confirmedCount:
          (counts?.get(TollEntryStatus.OK) || 0) +
          (counts?.get(TollEntryStatus.VERIFIED) || 0) +
          (counts?.get(TollEntryStatus.NEEDS_REVIEW) || 0),
        distanceKm: total?._sum.distanceKm || 0,
        entryCount: total?._count._all || 0,
        firstTollDate: total?._min.tollDate || null,
        lastTollDate: total?._max.tollDate || null,
        pendingCount: counts?.get(TollEntryStatus.PENDING) || 0,
        reviewCount: reviewByBatch.get(batch.id) || 0,
        storedNetCents: total?._sum.netAmountCents || 0,
        storedVatCents: total?._sum.vatAmountCents || 0,
        storedGrossCents: total?._sum.grossAmountCents || 0
      } satisfies TollBatchSummary;
    })
    .filter((batch) => !options.pendingOnly || batch.pendingCount > 0);
}
