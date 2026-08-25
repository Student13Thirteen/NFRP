import { requireUser } from '@/lib/auth';
import { TrailerBodyType, VehicleLifecycleStatus } from '@prisma/client';
import Link from 'next/link';
import { Archive, CircleAlert, FileText, Plus, Truck } from 'lucide-react';
import { InlineTrailerTypeSelect } from '@/components/InlineTrailerTypeSelect';
import { PageHeader } from '@/components/PageHeader';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { getVehicleLifecycleBadgeClass, getVehicleLifecycleLabel } from '@/lib/vehicle-lifecycle';
import {
  TANK_CARGO_TYPES,
  TRAILER_BODY_TYPES,
  UNCLASSIFIED_FILTER_VALUE,
  UNCLASSIFIED_LABEL,
  getTankCargoLabel,
  getTrailerBodyTypeLabel,
  getTrailerBodyTypePluralLabel,
  getTrailerTypeLabel,
  getVehicleTypeBadgeClass,
  matchesTrailerTypeFilter,
  parseTankCargoFilter,
  parseTrailerBodyTypeFilter
} from '@/lib/vehicle-types';
import { createTrailerAction, setTrailerBodyTypeAction } from './actions';

type TrailersPageProps = {
  searchParams: Promise<{ view?: string; type?: string; cargo?: string }>;
};

export default async function TrailersPage({ searchParams }: TrailersPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const inactiveView = resolvedSearchParams.view === 'inactive';
  const typeFilter = parseTrailerBodyTypeFilter(resolvedSearchParams.type);
  // Il carico si filtra solo dentro le cisterne: fuori da li non esiste.
  const cargoFilter = typeFilter === TrailerBodyType.TANK ? parseTankCargoFilter(resolvedSearchParams.cargo) : null;

  const [allTrailers, tractors] = await Promise.all([
    prisma.trailer.findMany({
      where: inactiveView
        ? { lifecycleStatus: { not: VehicleLifecycleStatus.ACTIVE } }
        : { lifecycleStatus: VehicleLifecycleStatus.ACTIVE },
      orderBy: [{ lifecycleEndedAt: 'desc' }, { plate: 'asc' }],
      include: { assignedTractor: true, _count: { select: { documents: true } } }
    }),
    prisma.tractor.findMany({ where: { lifecycleStatus: VehicleLifecycleStatus.ACTIVE }, orderBy: { plate: 'asc' } })
  ]);

  function buildHref(next: { type?: string | null; cargo?: string | null }): string {
    const params = new URLSearchParams();
    if (inactiveView) params.set('view', 'inactive');
    const nextType = next.type === undefined ? (typeFilter || null) : next.type;
    const nextCargo = next.cargo === undefined ? (cargoFilter || null) : next.cargo;
    if (nextType) params.set('type', nextType);
    if (nextCargo && nextType === TrailerBodyType.TANK) params.set('cargo', nextCargo);
    const query = params.toString();
    return query ? `/vehicles/trailers?${query}` : '/vehicles/trailers';
  }

  const typeCounts = new Map<string, number>();
  const cargoCounts = new Map<string, number>();
  for (const trailer of allTrailers) {
    const key = trailer.bodyType || UNCLASSIFIED_FILTER_VALUE;
    typeCounts.set(key, (typeCounts.get(key) || 0) + 1);
    if (trailer.bodyType === TrailerBodyType.TANK && trailer.tankCargo) {
      cargoCounts.set(trailer.tankCargo, (cargoCounts.get(trailer.tankCargo) || 0) + 1);
    }
  }
  const unclassifiedCount = typeCounts.get(UNCLASSIFIED_FILTER_VALUE) || 0;
  const tankCount = typeCounts.get(TrailerBodyType.TANK) || 0;
  const trailers = allTrailers.filter((trailer) => matchesTrailerTypeFilter(trailer, typeFilter, cargoFilter));

  return (
    <>
      <PageHeader
        title={inactiveView ? 'Semirimorchi fuori flotta' : 'Semirimorchi'}
        description={inactiveView ? 'Mezzi non attivi, venduti o rottamati con storico conservato.' : 'Anagrafica dei semirimorchi attualmente in flotta.'}
        action={
          <div className="actions-row">
            {inactiveView ? <Link className="secondary-button" href="/documents/disposed"><FileText size={16} aria-hidden />Documenti mezzi usciti</Link> : null}
            <Link className="secondary-button" href={inactiveView ? '/vehicles/trailers' : '/vehicles/trailers?view=inactive'}>
              {inactiveView ? <Truck size={16} aria-hidden /> : <Archive size={16} aria-hidden />}
              {inactiveView ? 'Semirimorchi in flotta' : 'Mezzi fuori flotta'}
            </Link>
          </div>
        }
      />
      <nav className="type-filter-bar" aria-label="Filtro tipologia semirimorchio">
        <span className="filter-count">Allestimento</span>
        <Link className={typeFilter ? 'secondary-button' : 'primary-button'} href={buildHref({ type: null, cargo: null })}>
          Tutti ({allTrailers.length})
        </Link>
        {TRAILER_BODY_TYPES.map((type) => (
          <Link
            className={typeFilter === type ? 'primary-button' : 'secondary-button'}
            href={buildHref({ type, cargo: null })}
            key={type}
          >
            {getTrailerBodyTypePluralLabel(type)} ({typeCounts.get(type) || 0})
          </Link>
        ))}
        {unclassifiedCount > 0 ? (
          <Link
            className={typeFilter === UNCLASSIFIED_FILTER_VALUE ? 'primary-button' : 'secondary-button'}
            href={buildHref({ type: UNCLASSIFIED_FILTER_VALUE, cargo: null })}
          >
            <CircleAlert size={16} aria-hidden />
            {UNCLASSIFIED_LABEL} ({unclassifiedCount})
          </Link>
        ) : null}
      </nav>
      {typeFilter === TrailerBodyType.TANK ? (
        <nav className="type-filter-bar type-filter-subbar" aria-label="Filtro carico cisterna">
          <span className="filter-count">Carico cisterna</span>
          <Link className={cargoFilter ? 'secondary-button' : 'primary-button'} href={buildHref({ cargo: null })}>
            Tutte ({tankCount})
          </Link>
          {TANK_CARGO_TYPES.map((cargo) => (
            <Link
              className={cargoFilter === cargo ? 'primary-button' : 'secondary-button'}
              href={buildHref({ cargo })}
              key={cargo}
            >
              {getTankCargoLabel(cargo)} ({cargoCounts.get(cargo) || 0})
            </Link>
          ))}
        </nav>
      ) : null}
      {!inactiveView && unclassifiedCount > 0 ? (
        <p className="muted" style={{ marginBottom: 16 }}>
          Puoi classificare i semirimorchi direttamente da questa tabella: scegli l&apos;allestimento nella colonna
          <strong> Allestimento</strong> e, per le cisterne, il carico. Il salvataggio avviene subito.
        </p>
      ) : null}
      <div className={`grid${inactiveView ? '' : ' two'}`}>
        {!inactiveView ? <section className="panel">
          <h2>Nuovo semirimorchio</h2>
          <form action={createTrailerAction} className="form-stack">
            <div className="form-grid">
              <label>
                Targa
                <input name="plate" required />
              </label>
              <label>
                Allestimento
                <select name="bodyType" defaultValue="">
                  <option value="">Da classificare</option>
                  {TRAILER_BODY_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {getTrailerBodyTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Carico cisterna
                <select name="tankCargo" defaultValue="">
                  <option value="">Solo per le cisterne</option>
                  {TANK_CARGO_TYPES.map((cargo) => (
                    <option key={cargo} value={cargo}>
                      {getTankCargoLabel(cargo)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Marca
                <input name="brand" />
              </label>
              <label>
                Modello
                <input name="model" />
              </label>
              <label>
                Trattore associato
                <select name="assignedTractorId" defaultValue="">
                  <option value="">Nessuno</option>
                  {tractors.map((tractor) => (
                    <option key={tractor.id} value={tractor.id}>
                      {tractor.plate}
                    </option>
                  ))}
                </select>
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
        </section> : null}
        <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Targa</th>
                <th>Allestimento</th>
                <th>Mezzo</th>
                <th>Trattore</th>
                <th>Stato</th>
                <th>Documenti</th>
              </tr>
            </thead>
            <tbody>
              {trailers.length === 0 ? (
                <tr><td className="empty-state" colSpan={6}>{inactiveView ? 'Nessun semirimorchio fuori flotta con questi filtri.' : 'Nessun semirimorchio in flotta con questi filtri.'}</td></tr>
              ) : trailers.map((trailer) => {
                const trailerHref = `/vehicles/trailers/${trailer.id}`;

                return (
                  <tr className="clickable-row" key={trailer.id}>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={trailerHref}>
                        <strong>{trailer.plate}</strong>
                      </Link>
                    </td>
                    <td className="fleet-type-cell">
                      {inactiveView ? (
                        <span className={`badge ${getVehicleTypeBadgeClass(Boolean(trailer.bodyType))}`}>
                          {getTrailerTypeLabel(trailer)}
                        </span>
                      ) : (
                        <InlineTrailerTypeSelect
                          save={setTrailerBodyTypeAction.bind(null, trailer.id)}
                          defaultBodyType={trailer.bodyType || ''}
                          defaultTankCargo={trailer.tankCargo || ''}
                          tankValue={TrailerBodyType.TANK}
                          plate={trailer.plate}
                          bodyOptions={TRAILER_BODY_TYPES.map((type) => ({
                            value: type,
                            label: getTrailerBodyTypeLabel(type)
                          }))}
                          cargoOptions={TANK_CARGO_TYPES.map((cargo) => ({
                            value: cargo,
                            label: getTankCargoLabel(cargo)
                          }))}
                        />
                      )}
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={trailerHref}>
                        {[trailer.brand, trailer.model].filter(Boolean).join(' ') || '-'}
                        {trailer.notes ? <div className="muted">{trailer.notes}</div> : null}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={trailerHref}>
                        {trailer.assignedTractor?.plate || '-'}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={trailerHref}>
                        <span className={`badge ${getVehicleLifecycleBadgeClass(trailer.lifecycleStatus)}`}>
                          {getVehicleLifecycleLabel(trailer.lifecycleStatus)}
                        </span>
                        {trailer.lifecycleEndedAt ? <span className="muted">Dal {formatDate(trailer.lifecycleEndedAt)}</span> : null}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={trailerHref}>
                        {trailer._count.documents}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
