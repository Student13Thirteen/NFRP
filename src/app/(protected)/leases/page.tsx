import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowRight, FileCheck2, Filter, UploadCloud } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { TablePagination } from '@/components/TablePagination';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import {
  formatLeaseMoney,
  getLeasePlate,
  getLeaseStatusLabel,
  getLeaseVehicleLabel,
  leaseContractInclude
} from '@/lib/lease';
import { paginateItems } from '@/lib/pagination';

type LeasePageProps = {
  searchParams: Promise<{ q?: string; status?: string; page?: string; pageSize?: string }>;
};

export default async function LeasesPage({ searchParams }: LeasePageProps) {
  await requireUser();
  const params = await searchParams;
  const contracts = await prisma.leaseContract.findMany({
    include: leaseContractInclude,
    orderBy: [{ createdAt: 'desc' }]
  });
  const query = (params.q || '').trim().toLocaleLowerCase('it-IT');
  const status = ['PENDING', 'ACTIVE', 'CLOSED', 'CANCELLED'].includes(params.status || '') ? params.status || '' : '';
  const rows = contracts.filter((contract) => {
    if (status && contract.status !== status) return false;
    if (!query) return true;
    return [
      contract.contractNumber,
      contract.lessor?.name,
      contract.lessorName,
      contract.vehicleSupplierName,
      getLeasePlate(contract),
      contract.originalFileName
    ].filter(Boolean).join(' ').toLocaleLowerCase('it-IT').includes(query);
  });
  const pagination = paginateItems(rows, params.page, params.pageSize);

  const active = contracts.filter((contract) => contract.status === 'ACTIVE');
  const pending = contracts.filter((contract) => contract.status === 'PENDING').length;
  const forecastGross = active.flatMap((contract) => contract.installments).reduce((sum, installment) => sum + installment.grossAmountCents, 0);
  const actualGross = contracts
    .flatMap((contract) => contract.invoices)
    .filter((invoice) => invoice.status === 'CONFIRMED')
    .reduce((sum, invoice) => sum + invoice.totalAmountCents, 0);

  return (
    <>
      <PageHeader
        title="Leasing"
        description="Contratti, piano canoni previsionale e fatture effettive collegate alle targhe."
        action={
          <div className="actions-row">
            {pending > 0 ? (
              <Link className="secondary-button" href="/leases/import/review">
                <FileCheck2 size={16} aria-hidden />
                Controlla ({pending})
              </Link>
            ) : null}
            <Link className="primary-button" href="/leases/import">
              <UploadCloud size={16} aria-hidden />
              Carica PDF leasing
            </Link>
          </div>
        }
      />

      <section className="metrics" aria-label="Riepilogo leasing">
        <div className="metric"><span>Contratti attivi</span><strong>{active.length}</strong></div>
        <div className="metric"><span>Da verificare</span><strong>{pending}</strong></div>
        <div className="metric"><span>Canoni previsti ivati</span><strong>{formatLeaseMoney(forecastGross)}</strong></div>
        <div className="metric"><span>Fatture confermate</span><strong>{formatLeaseMoney(actualGross)}</strong></div>
      </section>

      <form className="filter-bar" action="/leases">
        <label>
          Cerca
          <input name="q" placeholder="Contratto, locatore, targa" defaultValue={params.q || ''} />
        </label>
        <label>
          Stato
          <select name="status" defaultValue={status}>
            <option value="">Tutti</option>
            <option value="PENDING">Da verificare</option>
            <option value="ACTIVE">Attivi</option>
            <option value="CLOSED">Conclusi</option>
            <option value="CANCELLED">Annullati</option>
          </select>
        </label>
        <div className="filter-actions">
          <button className="primary-button" type="submit"><Filter size={15} aria-hidden />Filtra</button>
          <Link className="secondary-button" href="/leases">Reset</Link>
          <span className="filter-count">{rows.length} risultati</span>
        </div>
      </form>

      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Contratto</th>
              <th>Locatore</th>
              <th>Targa</th>
              <th>Decorrenza</th>
              <th>Canoni</th>
              <th>Totale netto</th>
              <th>Stato</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pagination.items.length === 0 ? (
              <tr><td colSpan={8} className="empty-state">Nessun contratto leasing trovato.</td></tr>
            ) : (
              pagination.items.map((contract) => (
                <tr key={contract.id}>
                  <td><Link className="table-cell-link" href={contract.status === 'PENDING' ? '/leases/import/review' : `/leases/${contract.id}`}><strong>{contract.contractNumber || 'Da verificare'}</strong></Link></td>
                  <td>{contract.lessor?.name || contract.lessorName || '-'}</td>
                  <td>{getLeaseVehicleLabel(contract)}</td>
                  <td>{contract.startDate ? formatDate(contract.startDate) : '-'}</td>
                  <td>{contract.installmentCount ?? '-'}</td>
                  <td>{formatLeaseMoney(contract.totalInstallmentsNetCents)}</td>
                  <td><span className={`badge ${contract.status === 'ACTIVE' ? 'fuel-status-ok' : contract.status === 'PENDING' ? 'fuel-status-review' : 'fuel-status-verified'}`}>{getLeaseStatusLabel(contract.status)}</span></td>
                  <td><Link className="table-cell-link" href={contract.status === 'PENDING' ? '/leases/import/review' : `/leases/${contract.id}`}>Apri <ArrowRight size={14} aria-hidden /></Link></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      <TablePagination
        currentPage={pagination.currentPage}
        from={pagination.from}
        pathname="/leases"
        searchParams={params}
        to={pagination.to}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
      />
    </>
  );
}
