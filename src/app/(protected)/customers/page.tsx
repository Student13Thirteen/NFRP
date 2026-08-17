import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { Building2, Plus } from 'lucide-react';
import { CustomerFormFields } from '@/components/CustomerFormFields';
import { PageHeader } from '@/components/PageHeader';
import { prisma } from '@/lib/db';
import { formatStructuredAddress } from '@/lib/addresses';
import { createCustomerAction } from './actions';

type CustomersPageProps = { searchParams: Promise<{ error?: string }> };

function fiscalSummary(customer: { vatNumber: string | null; taxCode: string | null; pecEmail: string | null }) {
  return [
    customer.vatNumber ? `P. IVA ${customer.vatNumber}` : null,
    customer.taxCode ? `C.F. ${customer.taxCode}` : null,
    customer.pecEmail || null
  ].filter(Boolean);
}

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  await requireUser();
  const params = await searchParams;
  const customers = await prisma.customer.findMany({
    include: { _count: { select: { containerTrips: true } } },
    orderBy: [{ active: 'desc' }, { name: 'asc' }]
  });

  return (
    <>
      <PageHeader
        title="Clienti"
        description="Committenti, dati fiscali e PEC per i trasporti container e la futura fatturazione elettronica."
      />
      {params.error ? <p className="form-error" style={{ marginBottom: 18 }}>{params.error}</p> : null}
      <div className="grid two">
        <section className="panel">
          <h2>Nuovo cliente</h2>
          <p className="muted">La ragione sociale e obbligatoria; i dati fiscali possono essere completati progressivamente.</p>
          <form action={createCustomerAction} className="form-stack">
            <CustomerFormFields />
            <button className="primary-button" type="submit">
              <Plus size={16} aria-hidden />
              Salva cliente
            </button>
          </form>
        </section>

        <section className="table-wrap">
          <table>
            <thead>
              <tr><th>Cliente</th><th>Dati fiscali</th><th>Viaggi</th><th>Stato</th></tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr><td colSpan={4} className="empty-state">Nessun cliente inserito.</td></tr>
              ) : customers.map((customer) => {
                const href = `/customers/${customer.id}`;
                const fiscal = fiscalSummary(customer);
                return (
                  <tr className="clickable-row" key={customer.id}>
                    <td className="click-cell"><Link className="table-cell-link" href={href}>
                      <strong>{customer.name}</strong>
                      <div className="muted">{customer.code || formatStructuredAddress(customer) || 'Codice non indicato'}</div>
                    </Link></td>
                    <td className="click-cell"><Link className="table-cell-link" href={href}>
                      {fiscal.length > 0 ? fiscal.map((value) => <div key={value}>{value}</div>) : <span className="muted">Da completare</span>}
                    </Link></td>
                    <td className="click-cell"><Link className="table-cell-link" href={href}>{customer._count.containerTrips}</Link></td>
                    <td className="click-cell"><Link className="table-cell-link" href={href}>
                      <span className={`badge ${customer.active ? 'valid' : 'inactive'}`}>{customer.active ? 'Attivo' : 'Non attivo'}</span>
                    </Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {customers.length > 0 ? (
            <p className="muted" style={{ padding: 16 }}><Building2 size={15} aria-hidden /> {customers.length} clienti in anagrafica</p>
          ) : null}
        </section>
      </div>
    </>
  );
}
