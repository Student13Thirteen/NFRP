// Costruisce le motivazioni di revisione (in italiano semplice: causa + cosa controllare)
// mostrate nel banner della pagina di validazione, sul modello di reviewReasons dei rifornimenti.
// Logica pura e testabile: lavora su forme minime, non sui tipi Prisma completi.

import type { AllocationKind } from '@/lib/expense-shared';
import { formatEuroCents } from '@/lib/expense-shared';

export type AnomalyLine = {
  description: string;
  imponibileCents: number;
  vatCents: number;
  totalCents: number;
  vatRatePercent: number;
  quantityMilli: number;
  allocationType: AllocationKind;
};

export type ExpenseAnomalyOptions = {
  /** Import/migrazione: una riga lasciata su GENERIC è da assegnare (non una scelta esplicita). */
  requireAllocation?: boolean;
  /** Migrazione: l'IVA non era registrata nel vecchio gestionale, è stata ipotizzata. */
  vatAssumed?: boolean;
  /** Totale dichiarato dal documento (piè di fattura), se noto, per il quadra/non quadra. */
  declaredTotalCents?: number | null;
};

const TOTAL_TOLERANCE_CENTS = 2;

function shortDescription(value: string): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return 'senza descrizione';
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
}

export function buildExpenseReviewReasons(lines: AnomalyLine[], options: ExpenseAnomalyOptions = {}): string | null {
  const reasons: string[] = [];

  if (lines.length === 0) {
    reasons.push('Nessuna riga di spesa: aggiungi almeno una voce prima di confermare.');
    return reasons.join(' ');
  }

  const computedTotal = lines.reduce((sum, line) => sum + line.totalCents, 0);

  // Righe senza importo
  const zeroAmount = lines.filter((line) => line.imponibileCents <= 0 && line.totalCents <= 0);
  if (zeroAmount.length > 0) {
    reasons.push(
      `${zeroAmount.length === 1 ? 'Una riga è' : `${zeroAmount.length} righe sono`} senza importo (es. «${shortDescription(
        zeroAmount[0].description
      )}»): inserisci prezzo o imponibile.`
    );
  }

  // Quantità a zero
  const zeroQty = lines.filter((line) => line.quantityMilli <= 0);
  if (zeroQty.length > 0) {
    reasons.push(`${zeroQty.length === 1 ? 'Una riga ha' : `${zeroQty.length} righe hanno`} quantità a zero: verifica la quantità.`);
  }

  // IVA ipotizzata (migrazione)
  if (options.vatAssumed) {
    reasons.push('IVA non registrata nel vecchio gestionale: impostata al 22% per ipotesi, verifica l’aliquota di ogni riga.');
  }

  // Allocazione mancante (solo import/migrazione: GENERIC = non assegnata)
  if (options.requireAllocation) {
    const unassigned = lines.filter((line) => line.allocationType === 'GENERIC');
    if (unassigned.length > 0) {
      reasons.push(
        `${unassigned.length === 1 ? 'Una riga è' : `${unassigned.length} righe sono`} senza allocazione: assegna targa, magazzino o azienda.`
      );
    }
  }

  // Totale dichiarato dal documento diverso dalla somma righe
  if (options.declaredTotalCents !== null && options.declaredTotalCents !== undefined) {
    if (Math.abs(options.declaredTotalCents - computedTotal) > TOTAL_TOLERANCE_CENTS) {
      reasons.push(
        `Totale righe ${formatEuroCents(computedTotal)} diverso dal totale del documento ${formatEuroCents(
          options.declaredTotalCents
        )}: controlla importi e IVA.`
      );
    }
  }

  return reasons.length > 0 ? reasons.join(' ') : null;
}
