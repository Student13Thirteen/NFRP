import { requireUser } from '@/lib/auth';
import { VehicleLifecycleStatus } from '@prisma/client';
import Link from 'next/link';
import { Archive, CheckCircle2, CircleAlert, FileText, Plus, Truck } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DatePartsInput } from '@/components/DatePartsInput';
import { formatDate, startOfDay, toDateInputValue } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { getVehicleLifecycleBadgeClass, getVehicleLifecycleLabel } from '@/lib/vehicle-lifecycle';
import { createTractorAction } from './actions';
import { activeTachographUpdateDocumentWhere } from '@/lib/tachograph-update';

type TractorsPageProps = {
  searchParams: Promise<{ view?: string; tachograph?: string; error?: string }>;
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
  const documentedCount = allTractors.filter((tractor) => tractor.documents.length > 0).length;
  const missingCount = allTractors.length - documentedCount;
  const tractors = allTractors.filter((tractor) => {
    if (tachographFilter === 'documented') return tractor.documents.length > 0;
    if (tachographFilter === 'missing') return tractor.documents.length === 0;
    return true;
  });

  return (
    <>
      <PageHeader
        title={inactiveView ? 'Trattori fuori flotta' : 'Trattori'}
        description={inactiveView ? 'Mezzi non attivi, venduti o rottamati con storico conservato.' : 'Anagrafica dei trattori attualmente in flotta.'}
        action={
          <div className="actions-row">
            {inactiveView ? <Link className="secondary-button" href="/documents/disposed"><FileText size={16} aria-hidden />Documenti mezzi usciti</Link> : null}
            <Link className="secondary-button" href={inactiveView ? '/vehicles/tractors' : '/vehicles/tractors?view=inactive'}>
              {inactiveView ? <Truck size={16} aria-hidden /> : <Archive size={16} aria-hidden />}
              {inactiveView ? 'Trattori in flotta' : 'Mezzi fuori flotta'}
            </Link>
          </div>
        }
      />
      {!inactiveView ? (
        <nav className="filter-bar" aria-label="Filtro documentazione aggiornamento tachigrafo">
          <span className="filter-count">Aggiornamento tachigrafo</span>
          <Link className={tachographFilter ? 'secondary-button' : 'primary-button'} href="/vehicles/tractors">
            Tutti ({allTractors.length})
          </Link>
          <Link
            className={tachographFilter === 'documented' ? 'primary-button' : 'secondary-button'}
            href="/vehicles/tractors?tachograph=documented"
          >
            <CheckCircle2 size={16} aria-hidden />
            Documentati ({documentedCount})
          </Link>
          <Link
            className={tachographFilter === 'missing' ? 'primary-button' : 'secondary-button'}
            href="/vehicles/tractors?tachograph=missing"
          >
            <CircleAlert size={16} aria-hidden />
            Da documentare ({missingCount})
          </Link>
        </nav>
      ) : null}
      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 16 }}>{resolvedSearchParams.error}</p> : null}
      <div className={`grid${inactiveView ? '' : ' two'}`}>
        {!inactiveView ? <section className="panel">
          <h2>Nuovo trattore</h2>
          <form action={createTractorAction} className="form-stack">
            <div className="form-grid">
              <label>
                Targa
                <input name="plate" required />
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
                <th>Veicolo</th>
                <th>Autista</th>
                <th>Stato</th>
                <th>Documenti</th>
              </tr>
            </thead>
            <tbody>
              {tractors.length === 0 ? (
                <tr><td className="empty-state" colSpan={5}>{inactiveView ? 'Nessun trattore fuori flotta.' : 'Nessun trattore in flotta.'}</td></tr>
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
