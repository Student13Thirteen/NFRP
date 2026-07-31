import { describe, expect, it } from 'vitest';
import { buildExpenseReviewReasons, type AnomalyLine } from '@/lib/expense-anomalies';

function line(overrides: Partial<AnomalyLine> = {}): AnomalyLine {
  return {
    description: 'Filtro olio',
    imponibileCents: 10000,
    vatCents: 2200,
    totalCents: 12200,
    vatRatePercent: 22,
    quantityMilli: 1000,
    allocationType: 'TRACTOR',
    ...overrides
  };
}

describe('buildExpenseReviewReasons', () => {
  it('documento corretto non genera segnalazioni', () => {
    expect(buildExpenseReviewReasons([line()])).toBeNull();
  });

  it('documento senza righe', () => {
    expect(buildExpenseReviewReasons([])).toContain('Nessuna riga');
  });

  it('riga senza importo', () => {
    const reasons = buildExpenseReviewReasons([line({ imponibileCents: 0, totalCents: 0 })]);
    expect(reasons).toContain('senza importo');
  });

  it('quantità a zero', () => {
    const reasons = buildExpenseReviewReasons([line({ quantityMilli: 0 })]);
    expect(reasons).toContain('quantità a zero');
  });

  it('IVA ipotizzata (migrazione)', () => {
    const reasons = buildExpenseReviewReasons([line()], { vatAssumed: true });
    expect(reasons).toContain('IVA non registrata');
  });

  it('allocazione mancante segnalata solo se richiesta (import/migrazione)', () => {
    const generic = [line({ allocationType: 'GENERIC' })];
    expect(buildExpenseReviewReasons(generic)).toBeNull();
    expect(buildExpenseReviewReasons(generic, { requireAllocation: true })).toContain('senza allocazione');
  });

  it('totale dichiarato diverso dalla somma righe', () => {
    const reasons = buildExpenseReviewReasons([line()], { declaredTotalCents: 20000 });
    expect(reasons).toContain('diverso dal totale del documento');
  });

  it('totale dichiarato uguale (entro tolleranza) non segnala', () => {
    const reasons = buildExpenseReviewReasons([line()], { declaredTotalCents: 12201 });
    expect(reasons).toBeNull();
  });
});
