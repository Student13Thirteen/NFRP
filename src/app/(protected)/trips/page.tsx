import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowRight, Fuel, Ship, UploadCloud } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { prisma } from '@/lib/db';

export default async function TripsHubPage() {
  await requireUser();
  const [fuelTrips, containerTrips, pendingImports, awaitingDriverData, underReview] = await Promise.all([
    prisma.trip.count(),
    prisma.containerTrip.count(),
    prisma.tripImportRow.count({ where: { status: 'PENDING' } }),
    prisma.containerTrip.count({ where: { status: 'AWAITING_DRIVER_DATA' } }),
    prisma.containerTrip.count({ where: { status: 'UNDER_REVIEW' } })
  ]);

  return (
    <>
      <PageHeader
        title="Viaggi"
        description="Due flussi separati: le consegne carburante conservano il loro schema; i trasporti container hanno committente, container, terminal, tappe, km ed extra dedicati."
        action={
          <Link className="primary-button" href={pendingImports > 0 ? '/trips/import/review' : '/trips/import'}>
            <UploadCloud size={16} aria-hidden />
            Importa bolle container
          </Link>
        }
      />

      {pendingImports > 0 ? (
        <section className="panel" style={{ marginBottom: 18 }}>
          <div className="actions-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ margin: 0 }}>
              <strong>{pendingImports}</strong> bolle container attendono la verifica prima di creare i viaggi.
            </p>
            <Link className="primary-button compact-button" href="/trips/import/review">
              Revisiona
              <ArrowRight size={15} aria-hidden />
            </Link>
          </div>
        </section>
      ) : null}

      <div className="grid two">
        <section className="panel">
          <Fuel size={28} aria-hidden />
          <h2>Consegne carburante</h2>
          <p>
            Flusso storico isolato per gasolio portuale: base di carico, punti vendita, prodotti, litri e PDF autista.
          </p>
          <div className="metrics" style={{ marginTop: 16 }}>
            <div className="metric"><span>Viaggi</span><strong>{fuelTrips}</strong></div>
          </div>
          <div className="actions-row">
            <Link className="primary-button" href="/trips/fuel">
              Apri consegne carburante
              <ArrowRight size={16} aria-hidden />
            </Link>
            <Link className="secondary-button" href="/trips/new">Nuovo</Link>
          </div>
        </section>

        <section className="panel">
          <Ship size={28} aria-hidden />
          <h2>Trasporti container</h2>
          <p>
            Flusso dedicato alle lettere di vettura: committente, booking, nave, terminal, più tappe, consuntivo km ed extra negoziati.
          </p>
          <div className="metrics" style={{ marginTop: 16 }}>
            <div className="metric"><span>Viaggi</span><strong>{containerTrips}</strong></div>
            <div className="metric"><span>Attesa autista</span><strong>{awaitingDriverData}</strong></div>
            <div className="metric"><span>Da verificare</span><strong>{underReview}</strong></div>
          </div>
          <div className="actions-row">
            <Link className="primary-button" href="/trips/container">
              Apri trasporti container
              <ArrowRight size={16} aria-hidden />
            </Link>
            <Link className="secondary-button" href="/trips/container/new">Nuovo</Link>
          </div>
        </section>
      </div>
    </>
  );
}
