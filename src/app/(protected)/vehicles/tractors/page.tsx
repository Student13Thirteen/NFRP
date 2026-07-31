import { requireUser } from '@/lib/auth';
import { VehicleLifecycleStatus } from '@prisma/client';
import Link from 'next/link';
import { Archive, FileText, Plus, Truck } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { getVehicleLifecycleBadgeClass, getVehicleLifecycleLabel } from '@/lib/vehicle-lifecycle';
import { createTractorAction } from './actions';

type TractorsPageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function TractorsPage({ searchParams }: TractorsPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const inactiveView = resolvedSearchParams.view === 'inactive';
  const [tractors, drivers] = await Promise.all([
    prisma.tractor.findMany({
      where: inactiveView
        ? { lifecycleStatus: { not: VehicleLifecycleStatus.ACTIVE } }
        : { lifecycleStatus: VehicleLifecycleStatus.ACTIVE },
      orderBy: [{ lifecycleEndedAt: 'desc' }, { plate: 'asc' }],
      include: { assignedDriver: true, _count: { select: { documents: true } } }
    }),
    prisma.driver.findMany({ where: { active: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] })
  ]);

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
                Autista associato
                <select name="assignedDriverId" defaultValue="">
                  <option value="">Nessuno</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {`${driver.lastName} ${driver.firstName}`.trim()}
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
                        {tractor.assignedDriver ? `${tractor.assignedDriver.lastName} ${tractor.assignedDriver.firstName}`.trim() : '-'}
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
