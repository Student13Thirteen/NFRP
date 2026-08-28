import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { Building2, Fuel, MapPinned, Plus, Save } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { RegistryList, type RegistryListItem } from '@/components/RegistrySearch';
import { prisma } from '@/lib/db';
import { buildRegistrySearchText } from '@/lib/registry-search';
import { updateVehicleOwnerAction } from './actions';

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

  const items: RegistryListItem[] = owners.map((owner) => {
    const usage = owner._count.fuelEntries + owner._count.externalTractorTrips + owner._count.externalTrailerTrips;
    const statusLabel = owner.active ? 'Attivo' : 'Non attivo';

    return {
      id: owner.id,
      search: buildRegistrySearchText([owner.name, owner.vatNumber, owner.phone, owner.notes, statusLabel]),
      content: (
        <details className="assignment-record" open={resolvedSearchParams.owner === owner.id}>
          <summary>
            <span className="assignment-driver-name">{owner.name}</span>
            <span className="assignment-period">{usage === 0 ? 'Mai utilizzato' : `${usage} record collegati`}</span>
            <span className={`badge ${owner.active ? 'valid' : 'inactive'}`}>{statusLabel}</span>
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
      )
    };
  });

  return (
    <>
      <PageHeader
        title="Proprietari mezzi terzi"
        description="Chi possiede i mezzi non aziendali usati in rifornimenti e viaggi. Non entrano in flotta e non hanno scadenze."
        action={
          <div className="actions-row">
            <Link className="secondary-button" href="/vehicles/tractors">
              <Building2 size={16} aria-hidden />
              Flotta aziendale
            </Link>
            <Link className="primary-button" href="/vehicles/owners/new">
              <Plus size={16} aria-hidden />
              Nuovo proprietario
            </Link>
          </div>
        }
      />
      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 16 }}>{resolvedSearchParams.error}</p> : null}
      <section className="detail-section">
        <h2>Anagrafica</h2>
        <RegistryList
          items={items}
          searchLabel="Cerca proprietario"
          searchPlaceholder="Nome, partita IVA, telefono..."
          entityLabel="proprietari"
          emptyState={
            <div className="empty-state assignment-empty-state">
              <Building2 size={24} aria-hidden />
              <strong>Nessun proprietario registrato</strong>
              <span>Comparira qui il primo che indichi su un rifornimento o un viaggio con mezzo non nostro.</span>
            </div>
          }
        />
      </section>
    </>
  );
}
