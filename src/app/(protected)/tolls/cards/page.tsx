import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { UploadCloud } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { prisma } from '@/lib/db';
import { getVehicleLabel } from '@/lib/trips';
import { tollCardInclude } from '@/lib/tolls';

export default async function TollCardsPage() {
  await requireUser();
  const cards = await prisma.tollCard.findMany({
    include: tollCardInclude,
    orderBy: [{ active: 'desc' }, { cardNumber: 'asc' }]
  });

  const assignedCount = cards.filter((card) => card.assignedTractorId).length;
  const unassignedCount = cards.length - assignedCount;

  return (
    <>
      <PageHeader
        title="Tessere autostrade"
        description="Archivio tessere creato automaticamente dagli import CSV e associato alle targhe quando il rapporto e univoco."
        action={
          <div className="actions-row">
            <Link className="secondary-button" href="/tolls">
              Autostrade
            </Link>
            <Link className="primary-button" href="/tolls/import">
              <UploadCloud size={16} aria-hidden />
              Import CSV
            </Link>
          </div>
        }
      />

      <section className="metrics" aria-label="Riepilogo tessere autostrade">
        <div className="metric">
          <span>Tessere</span>
          <strong>{cards.length}</strong>
        </div>
        <div className="metric">
          <span>Associate</span>
          <strong>{assignedCount}</strong>
        </div>
        <div className="metric">
          <span>Da associare</span>
          <strong>{unassignedCount}</strong>
        </div>
      </section>

      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tessera</th>
              <th>Provider</th>
              <th>Targa associata</th>
              <th>Righe pedaggio</th>
              <th>Stato</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {cards.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-state">
                  Nessuna tessera autostrade importata.
                </td>
              </tr>
            ) : (
              cards.map((card) => (
                <tr key={card.id}>
                  <td>
                    <strong>{card.cardNumber}</strong>
                    {card.label ? <div className="muted">{card.label}</div> : null}
                  </td>
                  <td>{card.providerName}</td>
                  <td>{card.assignedTractor ? getVehicleLabel(card.assignedTractor) : '-'}</td>
                  <td>{card._count.entries}</td>
                  <td>
                    <span className={`badge ${card.active ? 'fuel-status-ok' : 'fuel-status-needs-review'}`}>
                      {card.active ? 'Attiva' : 'Non attiva'}
                    </span>
                  </td>
                  <td>{card.notes || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
