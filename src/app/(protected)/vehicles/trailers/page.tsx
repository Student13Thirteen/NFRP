import { requireUser } from '@/lib/auth';
import { VehicleLifecycleStatus } from '@prisma/client';
import Link from 'next/link';
import { Archive, FileText, Plus, Truck } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { getVehicleLifecycleBadgeClass, getVehicleLifecycleLabel } from '@/lib/vehicle-lifecycle';
import { createTrailerAction } from './actions';

type TrailersPageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function TrailersPage({ searchParams }: TrailersPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const inactiveView = resolvedSearchParams.view === 'inactive';
  const [trailers, tractors] = await Promise.all([
    prisma.trailer.findMany({
      where: inactiveView
        ? { lifecycleStatus: { not: VehicleLifecycleStatus.ACTIVE } }
        : { lifecycleStatus: VehicleLifecycleStatus.ACTIVE },
      orderBy: [{ lifecycleEndedAt: 'desc' }, { plate: 'asc' }],
      include: { assignedTractor: true, _count: { select: { documents: true } } }
    }),
    prisma.tractor.findMany({ where: { lifecycleStatus: VehicleLifecycleStatus.ACTIVE }, orderBy: { plate: 'asc' } })
  ]);

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
                <th>Mezzo</th>
                <th>Trattore</th>
                <th>Stato</th>
                <th>Documenti</th>
              </tr>
            </thead>
            <tbody>
              {trailers.length === 0 ? (
                <tr><td className="empty-state" colSpan={5}>{inactiveView ? 'Nessun semirimorchio fuori flotta.' : 'Nessun semirimorchio in flotta.'}</td></tr>
              ) : trailers.map((trailer) => {
                const trailerHref = `/vehicles/trailers/${trailer.id}`;

                return (
                  <tr className="clickable-row" key={trailer.id}>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={trailerHref}>
                        <strong>{trailer.plate}</strong>
                      </Link>
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
