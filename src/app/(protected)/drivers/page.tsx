import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { prisma } from '@/lib/db';
import { createDriverAction } from './actions';

export default async function DriversPage() {
  await requireUser();
  const drivers = await prisma.driver.findMany({
    orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
    include: { _count: { select: { documents: true } } }
  });

  return (
    <>
      <PageHeader title="Autisti" description="Anagrafica autisti e documenti collegati." />
      <div className="grid two">
        <section className="panel">
          <h2>Nuovo autista</h2>
          <form action={createDriverAction} className="form-stack">
            <div className="form-grid">
              <label>
                Nome
                <input name="firstName" required />
              </label>
              <label>
                Cognome
                <input name="lastName" required />
              </label>
              <label>
                Telefono
                <input name="phone" />
              </label>
              <label>
                Email
                <input name="email" type="email" />
              </label>
            </div>
            <label>
              Note
              <textarea name="notes" />
            </label>
            <label className="checkbox-row">
              <input name="active" type="checkbox" defaultChecked />
              Attivo
            </label>
            <button className="primary-button" type="submit">
              <Plus size={16} aria-hidden />
              Salva
            </button>
          </form>
        </section>
        <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Autista</th>
                <th>Contatti</th>
                <th>Stato</th>
                <th>Documenti</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((driver) => {
                const driverHref = `/drivers/${driver.id}`;

                return (
                  <tr className="clickable-row" key={driver.id}>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={driverHref}>
                        <strong>
                          {driver.lastName} {driver.firstName}
                        </strong>
                        {driver.notes ? <div className="muted">{driver.notes}</div> : null}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={driverHref}>
                        {driver.phone || '-'}
                        <div className="muted">{driver.email || ''}</div>
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={driverHref}>
                        {driver.active ? 'Attivo' : 'Non attivo'}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={driverHref}>
                        {driver._count.documents}
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
