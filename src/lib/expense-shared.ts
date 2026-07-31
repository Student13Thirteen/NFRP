// Helper puri condivisi tra server e client (NIENTE import da @prisma/client o server-only):
// usati sia nelle pagine/azioni server sia nella griglia righe client (ExpenseLinesEditor).

export const VAT_RATES = [22, 10, 5, 4, 0] as const;

export type AllocationKind = 'TRACTOR' | 'TRAILER' | 'WAREHOUSE' | 'GENERIC';

export type LineComputation = {
  imponibileCents: number;
  vatCents: number;
  totalCents: number;
};

/** IVA e totale a partire dall'imponibile (in centesimi) e dall'aliquota (intero, es. 22). */
export function computeLineVat(imponibileCents: number, vatRatePercent: number): LineComputation {
  const safeImponibile = Math.max(0, Math.round(imponibileCents));
  const safeRate = Number.isFinite(vatRatePercent) ? Math.max(0, vatRatePercent) : 0;
  const vatCents = Math.round((safeImponibile * safeRate) / 100);
  return { imponibileCents: safeImponibile, vatCents, totalCents: safeImponibile + vatCents };
}

/** Scorpora l'imponibile da un totale ivato (es. importo storico digitato come "1720,20"). */
export function imponibileCentsFromTotal(totalCents: number, vatRatePercent: number): number {
  const safeTotal = Math.max(0, Math.round(totalCents));
  if (!Number.isFinite(vatRatePercent) || vatRatePercent <= 0) return safeTotal;
  return Math.round((safeTotal * 100) / (100 + vatRatePercent));
}

/** Imponibile riga da quantità (×1000) e prezzo unitario netto (centesimi). */
export function imponibileCentsFromUnit(quantityMilli: number, unitPriceCents: number): number {
  return Math.round((Math.max(0, quantityMilli) * Math.max(0, unitPriceCents)) / 1000);
}

export function formatEuroCents(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value / 100);
}

export function formatQuantityMilli(quantityMilli: number): string {
  return (quantityMilli / 1000).toLocaleString('it-IT', { maximumFractionDigits: 3 });
}

// Codifica dell'allocazione per le <select>: TRACTOR:<id> | TRAILER:<id> | WAREHOUSE | GENERIC
export type ParsedAllocation =
  | { kind: 'TRACTOR'; id: string }
  | { kind: 'TRAILER'; id: string }
  | { kind: 'WAREHOUSE' }
  | { kind: 'GENERIC' };

export function parseAllocationKey(value: string | null | undefined): ParsedAllocation {
  const raw = (value || '').trim();
  if (raw === 'WAREHOUSE') return { kind: 'WAREHOUSE' };
  if (raw === '' || raw === 'GENERIC') return { kind: 'GENERIC' };
  const [type, id] = raw.split(':');
  if (type === 'TRACTOR' && id) return { kind: 'TRACTOR', id };
  if (type === 'TRAILER' && id) return { kind: 'TRAILER', id };
  return { kind: 'GENERIC' };
}

export function allocationKeyFor(line: {
  allocationType: AllocationKind;
  tractorId: string | null;
  trailerId: string | null;
}): string {
  if (line.allocationType === 'TRACTOR' && line.tractorId) return `TRACTOR:${line.tractorId}`;
  if (line.allocationType === 'TRAILER' && line.trailerId) return `TRAILER:${line.trailerId}`;
  if (line.allocationType === 'WAREHOUSE') return 'WAREHOUSE';
  return 'GENERIC';
}
