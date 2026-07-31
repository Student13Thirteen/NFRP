import { requireUser } from '@/lib/auth';
import { WarehouseStatus } from '@prisma/client';
import Link from 'next/link';
import { ArrowRight, Download, Plus, Settings2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { TablePagination } from '@/components/TablePagination';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { paginateItems } from '@/lib/pagination';
import {
  formatMoneyCents,
  formatWarehouseQuantity,
  getWarehouseStatusLabel,
  warehouseItemInclude,
  warehouseItemMatchesSearch
} from '@/lib/warehouse';

type WarehousePageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    categoryId?: string;
    supplierId?: string;
    location?: string;
    pdf?: string;
    error?: string;
    page?: string;
    pageSize?: string;
  }>;
};

function warehouseStatusClass(status: WarehouseStatus): string {
  return status.toLowerCase().replace(/_/g, '-');
}

export default async function WarehousePage({ searchParams }: WarehousePageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const [items, categories, suppliers] = await Promise.all([
    prisma.warehouseItem.findMany({
      include: warehouseItemInclude,
      orderBy: [{ stockedAt: 'desc' }, { createdAt: 'desc' }]
    }),
    prisma.category.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.supplier.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] })
  ]);

  const statusFilter = Object.values(WarehouseStatus).includes(resolvedSearchParams.status as WarehouseStatus)
    ? (resolvedSearchParams.status as WarehouseStatus)
    : '';
  const categoryFilter = categories.some((category) => category.id === resolvedSearchParams.categoryId)
    ? resolvedSearchParams.categoryId || ''
    : '';
  const supplierFilter = suppliers.some((supplier) => supplier.id === resolvedSearchParams.supplierId)
    ? resolvedSearchParams.supplierId || ''
    : '';
  const locations = Array.from(new Set(items.map((item) => item.location).filter(Boolean) as string[])).sort((a, b) =>
    a.localeCompare(b, 'it')
  );
  const locationFilter = locations.includes(resolvedSearchParams.location || '') ? resolvedSearchParams.location || '' : '';
  const pdfFilter = resolvedSearchParams.pdf === 'missing' || resolvedSearchParams.pdf === 'present' ? resolvedSearchParams.pdf : '';

  const filteredItems = items.filter((item) => {
    if (statusFilter && item.status !== statusFilter) return false;
    if (categoryFilter && item.categoryId !== categoryFilter) return false;
    if (supplierFilter && item.supplierId !== supplierFilter) return false;
    if (locationFilter && item.location !== locationFilter) return false;
    if (pdfFilter === 'missing' && item.filePath) return false;
    if (pdfFilter === 'present' && !item.filePath) return false;
    return warehouseItemMatchesSearch(item, resolvedSearchParams.q);
  });

  const counts = {
    inStock: items.filter((item) => item.status === WarehouseStatus.IN_STOCK).length,
    lowStock: items.filter((item) => item.status === WarehouseStatus.LOW_STOCK).length,
    outOfStock: items.filter((item) => item.status === WarehouseStatus.OUT_OF_STOCK).length,
    missingPdf: items.filter((item) => !item.filePath).length
  };
  const pagination = paginateItems(filteredItems, resolvedSearchParams.page, resolvedSearchParams.pageSize);

  return (
    <>
      <PageHeader
        title="Magazzino"
        description="Stock, ricambi, materiale e documenti collegati senza usare targhe o autisti fittizi."
        action={
          <div className="actions-row">
            <Link className="secondary-button" href="/warehouse/settings">
              <Settings2 size={16} aria-hidden />
              Anagrafiche magazzino
            </Link>
            <Link className="primary-button" href="/warehouse/new">
              <Plus size={16} aria-hidden />
              Nuovo record
            </Link>
          </div>
        }
      />
      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <section className="metrics" aria-label="Riepilogo magazzino">
        <Link className="metric metric-link" href="/warehouse?status=IN_STOCK" aria-label="Vedi materiale disponibile">
          <span>Disponibili</span>
          <strong>{counts.inStock}</strong>
          <span className="metric-action">
            Vedi stock
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
        <Link className="metric metric-link" href="/warehouse?status=LOW_STOCK" aria-label="Vedi materiale sotto soglia">
          <span>Scorta bassa</span>
          <strong>{counts.lowStock}</strong>
          <span className="metric-action">
            Vedi stock
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
        <Link className="metric metric-link" href="/warehouse?status=OUT_OF_STOCK" aria-label="Vedi materiale esaurito">
          <span>Esauriti</span>
          <strong>{counts.outOfStock}</strong>
          <span className="metric-action">
            Vedi stock
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
        <Link className="metric metric-link pdf-missing" href="/warehouse?pdf=missing" aria-label="Vedi record magazzino senza PDF">
          <span>PDF mancanti</span>
          <strong>{counts.missingPdf}</strong>
          <span className="metric-action">
            Vedi stock
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
      </section>

      <form className="filter-bar" action="/warehouse">
        <label>
          Cerca
          <input name="q" placeholder="Articolo, codice, categoria, fornitore, posizione" defaultValue={resolvedSearchParams.q || ''} />
        </label>
        <label>
          Stato
          <select name="status" defaultValue={statusFilter}>
            <option value="">Tutti</option>
            {Object.values(WarehouseStatus).map((status) => (
              <option key={status} value={status}>
                {getWarehouseStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Categoria
          <select name="categoryId" defaultValue={categoryFilter}>
            <option value="">Tutti</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.active ? '' : ' (non attiva)'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fornitore
          <select name="supplierId" defaultValue={supplierFilter}>
            <option value="">Tutti</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
                {supplier.active ? '' : ' (non attivo)'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ubicazione
          <select name="location" defaultValue={locationFilter}>
            <option value="">Tutte</option>
            {locations.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </label>
        <label>
          PDF
          <select name="pdf" defaultValue={pdfFilter}>
            <option value="">Tutti</option>
            <option value="missing">Mancante</option>
            <option value="present">Presente</option>
          </select>
        </label>
        <div className="filter-actions">
          <button className="primary-button" type="submit">
            Filtra
          </button>
          <Link className="secondary-button" href="/warehouse">
            Reset
          </Link>
          <span className="filter-count">{filteredItems.length} risultati</span>
        </div>
      </form>

      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Materiale</th>
              <th>Categoria</th>
              <th>Fornitore</th>
              <th>Quantita</th>
              <th>Ubicazione</th>
              <th>Valore</th>
              <th>Stato</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={9} className="empty-state">
                  Nessun record magazzino trovato.
                </td>
              </tr>
            ) : (
              pagination.items.map((item) => {
                const itemHref = `/warehouse/${item.id}`;

                return (
                  <tr className="clickable-row" key={item.id}>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={itemHref}>
                        {formatDate(item.stockedAt)}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={itemHref}>
                        <strong>{item.title}</strong>
                        {item.code ? <div className="muted">{item.code}</div> : null}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={itemHref}>
                        {item.category.name}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={itemHref}>
                        {item.supplier?.name || '-'}
                        {item.documentNumber ? <div className="muted">{item.documentNumber}</div> : null}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={itemHref}>
                        {formatWarehouseQuantity(item)}
                        {item.minimumQuantity !== null ? <div className="muted">Min. {item.minimumQuantity} {item.unit}</div> : null}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={itemHref}>
                        {item.location || '-'}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={itemHref}>
                        {formatMoneyCents(item.amountCents)}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={itemHref}>
                        <span className={`badge warehouse-status-${warehouseStatusClass(item.status)}`}>
                          {getWarehouseStatusLabel(item.status)}
                        </span>
                      </Link>
                    </td>
                    <td>
                      {item.filePath ? (
                        <Link className="secondary-button compact-button" href={`/api/warehouse/${item.id}/file`} target="_blank">
                          <Download size={15} aria-hidden />
                          PDF
                        </Link>
                      ) : (
                        <span className="file-missing-pill">Manca PDF</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
      <TablePagination
        currentPage={pagination.currentPage}
        from={pagination.from}
        pathname="/warehouse"
        searchParams={resolvedSearchParams}
        to={pagination.to}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
      />
    </>
  );
}
