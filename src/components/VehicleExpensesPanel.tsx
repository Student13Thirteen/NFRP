import Link from 'next/link';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { formatEuroCents } from '@/lib/expense-shared';

type VehicleExpensesPanelProps =
  | { tractorId: string; trailerId?: undefined }
  | { trailerId: string; tractorId?: undefined };

type Row = {
  key: string;
  date: Date;
  source: string;
  description: string;
  odometerKm: number | null;
  nettoCents: number;
  ivatoCents: number;
};

function ivatoFromNetto(nettoCents: number, vatRatePercent: number | null): number {
  const rate = vatRatePercent ?? 0;
  return Math.round((nettoCents * (100 + rate)) / 100);
}

export async function VehicleExpensesPanel(props: VehicleExpensesPanelProps) {
  const where = props.tractorId ? { tractorId: props.tractorId } : { trailerId: props.trailerId };

  const [lines, movements] = await Promise.all([
    prisma.expenseLine.findMany({
      where: { ...where, document: { status: 'CONFIRMED' } },
      include: { document: { include: { supplier: true } } }
    }),
    prisma.warehouseMovement.findMany({
      where: { ...where, type: 'UNLOAD' },
      include: { warehouseItem: true }
    })
  ]);

  const rows: Row[] = [
    ...lines.map((line) => ({
      key: `line-${line.id}`,
      date: line.document.registeredAt,
      source: line.document.supplier?.name || line.document.supplierName || 'Documento di spesa',
      description: line.description,
      odometerKm: line.odometerKm,
      nettoCents: line.imponibileCents,
      ivatoCents: line.totalCents
    })),
    ...movements.map((movement) => {
      const netto = movement.amountCents ?? 0;
      return {
        key: `mov-${movement.id}`,
        date: movement.movementDate,
        source: 'Magazzino → montaggio',
        description: movement.warehouseItem.title,
        odometerKm: null,
        nettoCents: netto,
        ivatoCents: ivatoFromNetto(netto, movement.warehouseItem.vatRatePercent)
      };
    })
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const totalNetto = rows.reduce((sum, row) => sum + row.nettoCents, 0);
  const totalIvato = rows.reduce((sum, row) => sum + row.ivatoCents, 0);

  return (
    <section className="detail-section">
      <div className="actions-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Spese &amp; manutenzioni</h2>
        <div className="expense-totals" style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <span>
            Netto <strong>{formatEuroCents(totalNetto)}</strong>
          </span>
          <span>
            Ivato <strong>{formatEuroCents(totalIvato)}</strong>
          </span>
        </div>
      </div>

      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Origine</th>
              <th>Voce</th>
              <th>Km mezzo</th>
              <th>Netto</th>
              <th>Ivato</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-state">
                  Nessuna spesa registrata su questo mezzo. Aggiungile dai{' '}
                  <Link href="/maintenances/expenses">documenti di spesa</Link>.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.key}>
                  <td>{formatDate(row.date)}</td>
                  <td>{row.source}</td>
                  <td>{row.description}</td>
                  <td>{row.odometerKm === null ? '-' : `${row.odometerKm.toLocaleString('it-IT')} km`}</td>
                  <td>{formatEuroCents(row.nettoCents)}</td>
                  <td>{formatEuroCents(row.ivatoCents)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
