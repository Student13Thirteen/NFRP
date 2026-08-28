import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { RegistryTable, type RegistryTableRow } from '@/components/RegistrySearch';
import { prisma } from '@/lib/db';
import { formatStructuredAddress } from '@/lib/addresses';
import { buildRegistrySearchText } from '@/lib/registry-search';

function fiscalSummary(customer: { vatNumber: string | null; taxCode: string | null; pecEmail: string | null }) {
  return [
    customer.vatNumber ? `P. IVA ${customer.vatNumber}` : null,
    customer.taxCode ? `C.F. ${customer.taxCode}` : null,
    customer.pecEmail || null
  ].filter(Boolean);
}

export default async function CustomersPage() {
  await requireUser();
  const customers = await prisma.customer.findMany({
    include: { _count: { select: { containerTrips: true } } },
    orderBy: [{ active: 'desc' }, { name: 'asc' }]
  });

  const rows: RegistryTableRow[] = customers.map((customer) => {
    const href = `/customers/${customer.id}`;
    const fiscal = fiscalSummary(customer);
    const address = formatStructuredAddress(customer);
    const statusLabel = customer.active ? 'Attivo' : 'Non attivo';

    return {
      id: customer.id,
      search: buildRegistrySearchText([
        customer.name,
        customer.code,
        customer.vatNumber,
        customer.taxCode,
        customer.pecEmail,
        address,
        customer.notes,
        statusLabel
      ]),
      cells: (
        <>
          <td className="click-cell">
            <Link className="table-cell-link" href={href}>
              <strong>{customer.name}</strong>
              <div className="muted">{customer.code || address || 'Codice non indicato'}</div>
            </Link>
          </td>
          <td className="click-cell">
            <Link className="table-cell-link" href={href}>
              {fiscal.length > 0 ? fiscal.map((value) => <div key={value}>{value}</div>) : <span className="muted">Da completare</span>}
            </Link>
          </td>
          <td className="click-cell">
            <Link className="table-cell-link" href={href}>{customer._count.containerTrips}</Link>
          </td>
          <td className="click-cell">
            <Link className="table-cell-link" href={href}>
              <span className={`badge ${customer.active ? 'valid' : 'inactive'}`}>{statusLabel}</span>
            </Link>
          </td>
        </>
      )
    };
  });

  return (
    <>
      <PageHeader
        title="Clienti"
        description="Committenti, dati fiscali e PEC per i trasporti container e la futura fatturazione elettronica."
        action={
          <Link className="primary-button" href="/customers/new">
            <Plus size={16} aria-hidden />
            Nuovo cliente
          </Link>
        }
      />
      <RegistryTable
        rows={rows}
        columnCount={4}
        searchLabel="Cerca cliente"
        searchPlaceholder="Ragione sociale, codice, P. IVA, citta..."
        entityLabel="clienti"
        emptyText="Nessun cliente inserito. Usa Nuovo cliente per inserire il primo committente."
        head={
          <tr>
            <th>Cliente</th>
            <th>Dati fiscali</th>
            <th>Viaggi</th>
            <th>Stato</th>
          </tr>
        }
      />
    </>
  );
}
