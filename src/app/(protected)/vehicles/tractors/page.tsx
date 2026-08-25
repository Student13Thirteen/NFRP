import { requireUser } from '@/lib/auth';
import { VehicleLifecycleStatus } from '@prisma/client';
import Link from 'next/link';
import { Archive, CheckCircle2, CircleAlert, FileText, Plus, Truck } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DatePartsInput } from '@/components/DatePartsInput';
import { InlineVehicleTypeSelect } from '@/components/InlineVehicleTypeSelect';
import { formatDate, startOfDay, toDateInputValue } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { getVehicleLifecycleBadgeClass, getVehicleLifecycleLabel } from '@/lib/vehicle-lifecycle';
import {
  MOTOR_VEHICLE_TYPES,
  UNCLASSIFIED_FILTER_VALUE,
  UNCLASSIFIED_LABEL,
  getMotorVehicleTypeLabel,
  getMotorVehicleTypePluralLabel,
  getVehicleTypeBadgeClass,
  matchesMotorVehicleTypeFilter,
  parseMotorVehicleTypeFilter
} from '@/lib/vehicle-types';
import { createTractorAction, setTractorVehicleTypeAction } from './actions';
import { activeTachographUpdateDocumentWhere } from '@/lib/tachograph-update';

type TractorsPageProps = {
  searchParams: Promise<{ view?: string; tachograph?: string; type?: string; error?: string }>;
};

export default async function TractorsPage({ searchParams }: TractorsPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const inactiveView = resolvedSearchParams.view === 'inactive';
  const today = startOfDay(new Date());
  const [allTractors, drivers] = await Promise.all([
    prisma.tractor.findMany({
      where: inactiveView
        ? { lifecycleStatus: { not: VehicleLifecycleStatus.ACTIVE } }
        : { lifecycleStatus: VehicleLifecycleStatus.ACTIVE },
      orderBy: [{ lifecycleEndedAt: 'desc' }, { plate: 'asc' }],
      include: {
        driverAssignments: {
          where: {
            validFrom: { lte: today },
            OR: [{ validTo: null }, { validTo: { gte: today } }]
          },
          include: { driver: true },
          orderBy: { validFrom: 'desc' },
          take: 1
        },
        assignedTrailers: { select: { id: true, plate: true }, orderBy: { plate: 'asc' } },
        documents: {
          where: activeTachographUpdateDocumentWhere,
          select: { id: true, issueDate: true, filePath: true },
          orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }]
        },
        _count: { select: { documents: true } }
      }
    }),
    prisma.driver.findMany({ where: { active: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] })
  ]);
  const tachographFilter = ['documented', 'missing'].includes(resolvedSearchParams.tachograph || '')
    ? resolvedSearchParams.tachograph
    : undefined;
  const typeFilter = parseMotorVehicleTypeFilter(resolvedSearchParams.type);

  // I due filtri sono assi indipendenti: cambiando tipologia non si perde il
  // filtro tachigrafo e viceversa.
  function buildHref(next: { type?: string | null; tachograph?: string | null }): string {
    const params = new URLSearchParams();
    if (inactiveView) params.set('view', 'inactive');
    const nextType = next.type === undefined ? (typeFilter || null) : next.type;
    const nextTachograph = next.tachograph === undefined ? (tachographFilter || null) : next.tachograph;
    if (nextType) params.set('type', nextType);
    if (nextTachograph) params.set('tachograph', nextTachograph);
    const query = params.toString();
    return query ? `/vehicles/tractors?${query}` : '/vehicles/tractors';
  }

  const typeCounts = new Map<string, number>();
  for (const tractor of allTractors) {
    const key = tractor.vehicleType || UNCLASSIFIED_FILTER_VALUE;
    typeCounts.set(key, (typeCounts.get(key) || 0) + 1);
  }
  const unclassifiedCount = typeCounts.get(UNCLASSIFIED_FILTER_VALUE) || 0;

  const typeFilteredTractors = allTractors.filter((tractor) => matchesMotorVehicleTypeFilter(tractor, typeFilter));
  const documentedCount = typeFilteredTractors.filter((tractor) => tractor.documents.length > 0).length;
  const missingCount = typeFilteredTractors.length - documentedCount;
  const tractors = typeFilteredTractors.filter((tractor) => {
    if (tachographFilter === 'documented') return tractor.documents.length > 0;
    if (tachographFilter === 'missing') return tractor.documents.length === 0;
    return true;
  });

  return (
    <>
      <PageHeader
        title={inactiveView ? 'Mezzi a motore fuori flotta' : 'Mezzi a motore'}
        description={
          inactiveView
            ? 'Trattori, motrici, furgoni, autocarri e autovetture non attivi, venduti o rottamati con storico conservato.'
            : 'Trattori, motrici, furgoni, autocarri e autovetture attualmente in flotta.'
        }
        action={
          <div className="actions-row">
            {inactiveView ? <Link className="secondary-button" href="/documents/disposed"><FileText size={16} aria-hidden />Documenti mezzi usciti</Link> : null}
            <Link className="secondary-button" href={inactiveView ? '/vehicles/tractors' : '/vehicles/tractors?view=inactive'}>
              {inactiveView ? <Truck size={16} aria-hidden /> : <Archive size={16} aria-hidden />}
              {inactiveView ? 'Mezzi in flotta' : 'Mezzi fuori flotta'}
            </Link>
          </div>
        }
      />
      <nav className="type-filter-bar" aria-label="Filtro tipologia mezzo">
        <span className="filter-count">Tipologia</span>
        <Link className={typeFilter ? 'secondary-button' : 'primary-button'} href={buildHref({ type: null })}>
          Tutti ({allTractors.length})
        </Link>
        {MOTOR_VEHICLE_TYPES.map((type) => (
          <Link
            className={typeFilter === type ? 'primary-button' : 'secondary-button'}
            href={buildHref({ type })}
            key={type}
          >
            {getMotorVehicleTypePluralLabel(type)} ({typeCounts.get(type) || 0})
          </Link>
        ))}
        {unclassifiedCount > 0 ? (
          <Link
            className={typeFilter === UNCLASSIFIED_FILTER_VALUE ? 'primary-button' : 'secondary-button'}
            href={buildHref({ type: UNCLASSIFIED_FILTER_VALUE })}
          >
            <CircleAlert size={16} aria-hidden />
            {UNCLASSIFIED_LABEL} ({unclassifiedCount})
          </Link>
        ) : null}
      </nav>
      {!inactiveView ? (
        <nav className="type-filter-bar type-filter-subbar" aria-label="Filtro documentazione aggiornamento tachigrafo">
          <span className="filter-count">Aggiornamento tachigrafo</span>
          <Link className={tachographFilter ? 'secondary-button' : 'primary-button'} href={buildHref({ tachograph: null })}>
            Tutti ({typeFilteredTractors.length})
          </Link>
          <Link
            className={tachographFilter === 'documented' ? 'primary-button' : 'secondary-button'}
            href={buildHref({ tachograph: 'documented' })}
          >
            <CheckCircle2 size={16} aria-hidden />
            Documentati ({documentedCount})
          </Link>
          <Link
            className={tachographFilter === 'missing' ? 'primary-button' : 'secondary-button'}
            href={buildHref({ tachograph: 'missing' })}
          >
            <CircleAlert size={16} aria-hidden />
            Da documentare ({missingCount})
          </Link>
        </nav>
      ) : null}
      {!inactiveView && unclassifiedCount > 0 ? (
        <p className="muted" style={{ marginBottom: 16 }}>
          Puoi classificare i mezzi direttamente da questa tabella: scegli la tipologia nella colonna <strong>Tipologia</strong> e
          il salvataggio avviene subito, senza aprire la scheda.
        </p>
      ) : null}
      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 16 }}>{resolvedSearchParams.error}</p> : null}
      <div className={`grid${inactiveView ? '' : ' two'}`}>
        {!inactiveView ? <section className="panel">
          <h2>Nuovo mezzo</h2>
          <form action={createTractorAction} className="form-stack">
            <div className="form-grid">
              <label>
                Targa
                <input name="plate" required />
              </label>
              <label>
                Tipologia
                <select name="vehicleType" defaultValue="">
                  <option value="">Da classificare</option>
                  {MOTOR_VEHICLE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {getMotorVehicleTypeLabel(type)}
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
                Autista iniziale
                <select name="assignedDriverId" defaultValue="">
                  <option value="">Nessuno</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {`${driver.lastName} ${driver.firstName}`.trim()}
                    </option>
                  ))}
                </select>
              </label>
              <DatePartsInput
                label="Associazione dal"
                name="assignmentValidFrom"
                defaultValue={toDateInputValue(today)}
              />
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
                <th>Tipologia</th>
                <th>Veicolo</th>
                <th>Autista</th>
                <th>Semirimorchio</th>
                <th>Stato</th>
                <th>Documenti</th>
              </tr>
            </thead>
            <tbody>
              {tractors.length === 0 ? (
                <tr><td className="empty-state" colSpan={7}>{inactiveView ? 'Nessun mezzo fuori flotta con questi filtri.' : 'Nessun mezzo in flotta con questi filtri.'}</td></tr>
              ) : tractors.map((tractor) => {
                const tractorHref = `/vehicles/tractors/${tractor.id}`;

                return (
                  <tr className="clickable-row" key={tractor.id}>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={tractorHref}>
                        <strong>{tractor.plate}</strong>
                        <div>
                          {tractor.documents.length > 0 ? (
                            <span className="badge valid tachograph-evidence-badge">Aggiornamento tachigrafo documentato</span>
                          ) : (
                            <span className="badge thirtyDays tachograph-evidence-badge">Documentazione tachigrafo mancante</span>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="fleet-type-cell">
                      {inactiveView ? (
                        <span className={`badge ${getVehicleTypeBadgeClass(Boolean(tractor.vehicleType))}`}>
                          {getMotorVehicleTypeLabel(tractor.vehicleType)}
                        </span>
                      ) : (
                        <InlineVehicleTypeSelect
                          save={setTractorVehicleTypeAction.bind(null, tractor.id)}
                          defaultValue={tractor.vehicleType || ''}
                          label={`Tipologia del mezzo ${tractor.plate}`}
                          options={MOTOR_VEHICLE_TYPES.map((type) => ({
                            value: type,
                            label: getMotorVehicleTypeLabel(type)
                          }))}
                        />
                      )}
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={tractorHref}>
                        {[tractor.brand, tractor.model].filter(Boolean).join(' ') || '-'}
                        {tractor.notes ? <div className="muted">{tractor.notes}</div> : null}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={tractorHref}>
                        {tractor.driverAssignments[0]
                          ? `${tractor.driverAssignments[0].driver.lastName} ${tractor.driverAssignments[0].driver.firstName}`.trim()
                          : '-'}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={tractorHref}>
                        {tractor.assignedTrailers.length === 0
                          ? '-'
                          : tractor.assignedTrailers.map((trailer) => trailer.plate).join(', ')}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={tractorHref}>
                        <span className={`badge ${getVehicleLifecycleBadgeClass(tractor.lifecycleStatus)}`}>
                          {getVehicleLifecycleLabel(tractor.lifecycleStatus)}
                        </span>
                        {tractor.lifecycleEndedAt ? <span className="muted">Dal {formatDate(tractor.lifecycleEndedAt)}</span> : null}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={tractorHref}>
                        {tractor._count.documents}
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
