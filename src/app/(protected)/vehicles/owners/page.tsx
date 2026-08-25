import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { Building2, Fuel, MapPinned, Plus, Save } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { prisma } from '@/lib/db';
import { createVehicleOwnerAction, updateVehicleOwnerAction } from './actions';

type VehicleOwnersPageProps = {
  searchParams: Promise<{ error?: string; owner?: string }>;
};

export default async function VehicleOwnersPage({ searchParams }: VehicleOwnersPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const owners = await prisma.vehicleOwner.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    include: {
      _count: { select: { fuelEntries: true, externalTractorTrips: true, externalTrailerTrips: true } }
    }
  });

  return (
    <>
      <PageHeader
        title="Proprietari mezzi terzi"
        description="Chi possiede i mezzi non aziendali usati in rifornimenti e viaggi. Non entrano in flotta e non hanno scadenze."
        action={
          <Link className="secondary-button" href="/vehicles/tractors">
            <Building2 size={16} aria-hidden />
            Flotta aziendale
          </Link>
        }
      />
      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 16 }}>{resolvedSearchParams.error}</p> : null}
      <div className="grid two">
        <section className="panel">
          <h2>Nuovo proprietario</h2>
          <p className="muted">
            Basta il nome. Si crea anche da solo quando lo scrivi in un rifornimento o in un viaggio con targa non aziendale.
          </p>
          <form action={createVehicleOwnerAction} className="form-stack">
            <div className="form-grid">
              <label>
                Nome o ragione sociale
                <input name="name" required maxLength={160} />
              </label>
              <label>
                Partita IVA
                <input name="vatNumber" maxLength={20} />
              </label>
              <label>
                Telefono
                <input name="phone" maxLength={40} />
              </label>
            </div>
            <label>
              Note
              <textarea name="notes" />
            </label>
            <button className="primary-button" type="submit">
              <Plus size={16} aria-hidden />
              Salva
            </button>
          </form>
        </section>

        <section className="detail-section">
          <h2>
            Anagrafica <span className="section-count">({owners.length})</span>
          </h2>
          {owners.length === 0 ? (
            <div className="empty-state assignment-empty-state">
              <Building2 size={24} aria-hidden />
              <strong>Nessun proprietario registrato</strong>
              <span>Comparira qui il primo che indichi su un rifornimento o un viaggio con mezzo non nostro.</span>
            </div>
          ) : (
            <div className="assignment-history">
              {owners.map((owner) => {
                const usage = owner._count.fuelEntries + owner._count.externalTractorTrips + owner._count.externalTrailerTrips;

                return (
                  <details className="assignment-record" key={owner.id} open={resolvedSearchParams.owner === owner.id}>
                    <summary>
                      <span className="assignment-driver-name">{owner.name}</span>
                      <span className="assignment-period">
                        {usage === 0 ? 'Mai utilizzato' : `${usage} record collegati`}
                      </span>
                      <span className={`badge ${owner.active ? 'valid' : 'inactive'}`}>
                        {owner.active ? 'Attivo' : 'Non attivo'}
                      </span>
                    </summary>
                    <div className="assignment-record-body">
                      <div className="actions-row">
                        <Link className="secondary-button compact-button" href={`/fuel?ownerId=${owner.id}`}>
                          <Fuel size={15} aria-hidden />
                          Rifornimenti ({owner._count.fuelEntries})
                        </Link>
                        <span className="muted">
                          <MapPinned size={15} aria-hidden />{' '}
                          Viaggi con mezzi di questo proprietario:{' '}
                          {owner._count.externalTractorTrips + owner._count.externalTrailerTrips}
                        </span>
                      </div>
                      <form action={updateVehicleOwnerAction.bind(null, owner.id)} className="form-stack">
                        <div className="form-grid">
                          <label>
                            Nome o ragione sociale
                            <input name="name" defaultValue={owner.name} required maxLength={160} />
                          </label>
                          <label>
                            Partita IVA
                            <input name="vatNumber" defaultValue={owner.vatNumber || ''} maxLength={20} />
                          </label>
                          <label>
                            Telefono
                            <input name="phone" defaultValue={owner.phone || ''} maxLength={40} />
                          </label>
                        </div>
                        <label>
                          Note
                          <textarea name="notes" defaultValue={owner.notes || ''} />
                        </label>
                        <label className="checkbox-row">
                          <input name="active" type="checkbox" defaultChecked={owner.active} />
                          Attivo
                        </label>
                        <button className="secondary-button" type="submit">
                          <Save size={16} aria-hidden />
                          Salva modifiche
                        </button>
                      </form>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
