import { requireUser } from '@/lib/auth';
import { FuelEntryStatus } from '@prisma/client';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Download, Plus, Settings2, UploadCloud } from 'lucide-react';
import { DatePartFilters } from '@/components/DatePartFilters';
import { FilteredReportButton } from '@/components/FilteredReportButton';
import { PageHeader } from '@/components/PageHeader';
import { TablePagination } from '@/components/TablePagination';
import { buildDateFilterYears, parseFilterDateParts } from '@/lib/date-filters';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import {
  formatFuelConsumption,
  formatFuelCostPerKm,
  formatFuelLiters,
  formatFuelMoney,
  formatFuelPrice,
  fuelEntryInclude,
  getFuelDriverLabel,
  getFuelEntryStatusLabel,
  getFuelVehicleLabel,
  type FuelEntryWithRelations
} from '@/lib/fuel';
import { getDriverLabel, getVehicleLabel } from '@/lib/trips';
import { isDefaultFuelProductCode } from '@/lib/fuel-parser';
import { filterFuelEntries, type FuelSearchParams } from '@/lib/fuel-filters';
import { paginateItems } from '@/lib/pagination';

type FuelPageProps = {
  searchParams: Promise<FuelSearchParams>;
};

type FuelPlateSummary = {
  plate: string;
  productCode: string;
  productLabel: string;
  count: number;
  volumeLitersMilli: number;
  totalAmountCents: number;
  km: number;
  amountWithKmCents: number;
  volumeWithKmMilli: number;
  reviewCount: number;
};

function getFuelProductLabel(entry: FuelEntryWithRelations): string {
  return entry.fuelProduct?.name || entry.productName || entry.productCode || 'Prodotto';
}

// Solo i carburanti di trazione (non l'AdBlue) determinano i km percorsi e
// l'euro/km "principale" della targa nei totali in alto: l'AdBlue copre la stessa
// distanza, contarlo li' significherebbe contare i km due volte.
function entryContributesToGlobalKm(entry: FuelEntryWithRelations): boolean {
  return Boolean(
    entry.kmDelta && entry.status !== FuelEntryStatus.NEEDS_REVIEW && isDefaultFuelProductCode(entry.productCode)
  );
}

// Il riepilogo e' per (targa + prodotto): ogni prodotto pesato sulla propria
// catena di km, cosi' AdBlue e gasolio non si mescolano mai.
function buildPlateSummaries(entries: FuelEntryWithRelations[]): FuelPlateSummary[] {
  const summaries = new Map<string, FuelPlateSummary>();

  for (const entry of entries) {
    const key = `${entry.plate}|${entry.productCode}`;
    const summary =
      summaries.get(key) ||
      ({
        plate: entry.plate,
        productCode: entry.productCode,
        productLabel: getFuelProductLabel(entry),
        count: 0,
        volumeLitersMilli: 0,
        totalAmountCents: 0,
        km: 0,
        amountWithKmCents: 0,
        volumeWithKmMilli: 0,
        reviewCount: 0
      } satisfies FuelPlateSummary);

    summary.count += 1;
    summary.volumeLitersMilli += entry.volumeLitersMilli;
    summary.totalAmountCents += entry.totalAmountCents;
    if (entry.status === FuelEntryStatus.NEEDS_REVIEW) summary.reviewCount += 1;
    if (entry.kmDelta && entry.status !== FuelEntryStatus.NEEDS_REVIEW) {
      summary.km += entry.kmDelta;
      summary.amountWithKmCents += entry.totalAmountCents;
      summary.volumeWithKmMilli += entry.volumeLitersMilli;
    }
    summaries.set(key, summary);
  }

  return Array.from(summaries.values()).sort(
    (a, b) => a.plate.localeCompare(b.plate) || b.totalAmountCents - a.totalAmountCents
  );
}

function formatCostPerKmFromTotals(amountCents: number, km: number): string {
  if (km <= 0) return '-';
  return formatFuelCostPerKm(Math.round((amountCents * 10) / km));
}

function formatConsumptionFromTotals(volumeLitersMilli: number, km: number): string {
  if (km <= 0) return '-';
  // decimi di L/100 km = litriMilli / km (coerente con calculateMetrics).
  return formatFuelConsumption(Math.round(volumeLitersMilli / km));
}

export default async function FuelPage({ searchParams }: FuelPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const [entries, tractors, drivers, suppliers, cards, products] = await Promise.all([
    prisma.fuelEntry.findMany({
      include: fuelEntryInclude,
      orderBy: [{ fuelDate: 'desc' }, { fuelTime: 'desc' }, { createdAt: 'desc' }]
    }),
    prisma.tractor.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] }),
    prisma.driver.findMany({ orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.fuelSupplier.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.fuelCard.findMany({
      include: { fuelSupplier: true, assignedTractor: true },
      orderBy: [{ active: 'desc' }, { fuelSupplier: { name: 'asc' } }, { cardNumber: 'asc' }]
    }),
    prisma.fuelProduct.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }, { code: 'asc' }] })
  ]);

  const tractorFilter = tractors.some((tractor) => tractor.id === resolvedSearchParams.tractorId) ? resolvedSearchParams.tractorId || '' : '';
  const driverFilter = drivers.some((driver) => driver.id === resolvedSearchParams.driverId) ? resolvedSearchParams.driverId || '' : '';
  const supplierFilter = suppliers.some((supplier) => supplier.id === resolvedSearchParams.fuelSupplierId)
    ? resolvedSearchParams.fuelSupplierId || ''
    : '';
  const cardFilter = cards.some((card) => card.id === resolvedSearchParams.fuelCardId) ? resolvedSearchParams.fuelCardId || '' : '';
  const productFilter = products.some((product) => product.id === resolvedSearchParams.fuelProductId)
    ? resolvedSearchParams.fuelProductId || ''
    : products.find((product) => product.code === resolvedSearchParams.productCode)?.id || '';
  const selectedProduct = products.find((product) => product.id === productFilter) || null;
  const reviewFilter = ['needs_review', 'verified', 'ok'].includes(resolvedSearchParams.review || '') ? resolvedSearchParams.review || '' : '';
  const fromDate = parseFilterDateParts(resolvedSearchParams, 'from');
  const toDate = parseFilterDateParts(resolvedSearchParams, 'to');
  const yearOptions = buildDateFilterYears(entries.map((entry) => entry.fuelDate));

  // Le righe importate in attesa (PENDING) restano fuori dal centro costi finche'
  // l'operatore non le conferma dalla pagina di revisione dell'import.
  const pendingEntries = entries.filter((entry) => entry.status === FuelEntryStatus.PENDING);

  const filteredEntries = filterFuelEntries(entries, {
    ...resolvedSearchParams,
    tractorId: tractorFilter,
    driverId: driverFilter,
    fuelSupplierId: supplierFilter,
    fuelCardId: cardFilter,
    fuelProductId: selectedProduct?.id || '',
    productCode: selectedProduct?.code || '',
    review: reviewFilter
  });

  const totalAmountCents = filteredEntries.reduce((sum, entry) => sum + entry.totalAmountCents, 0);
  const totalVolumeLitersMilli = filteredEntries.reduce((sum, entry) => sum + entry.volumeLitersMilli, 0);
  const reviewCount = filteredEntries.filter((entry) => entry.status === FuelEntryStatus.NEEDS_REVIEW).length;
  const validKm = filteredEntries.reduce((sum, entry) => (entryContributesToGlobalKm(entry) ? sum + (entry.kmDelta || 0) : sum), 0);
  const amountWithKmCents = filteredEntries.reduce(
    (sum, entry) => (entryContributesToGlobalKm(entry) ? sum + entry.totalAmountCents : sum),
    0
  );
  const plateSummaries = buildPlateSummaries(filteredEntries);
  const pagination = paginateItems(filteredEntries, resolvedSearchParams.page, resolvedSearchParams.pageSize);

  return (
    <>
      <PageHeader
        title="Rifornimenti"
        description="Centro costi carburante per targa, autista, distributore e tessera."
        action={
          <div className="actions-row">
            <FilteredReportButton baseHref="/api/reports/fuel" />
            <Link className="secondary-button" href="/fuel/settings">
              <Settings2 size={16} aria-hidden />
              Distributori e tessere
            </Link>
            <Link className="secondary-button" href="/fuel/import">
              <UploadCloud size={16} aria-hidden />
              Import PDF
            </Link>
            <Link className="primary-button" href="/fuel/new">
              <Plus size={16} aria-hidden />
              Nuovo rifornimento
            </Link>
          </div>
        }
      />

      {pendingEntries.length > 0 ? (
        <Link
          href="/fuel/import/review"
          className="panel"
          style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, textDecoration: 'none' }}
        >
          <AlertTriangle size={18} aria-hidden />
          <strong>{pendingEntries.length} righe importate in attesa di conferma.</strong>
          <span className="metric-action" style={{ marginLeft: 'auto' }}>
            Rivedi e conferma
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
      ) : null}

      <section className="metrics" aria-label="Riepilogo rifornimenti">
        <div className="metric">
          <span>Costo totale</span>
          <strong>{formatFuelMoney(totalAmountCents)}</strong>
        </div>
        <div className="metric">
          <span>Litri</span>
          <strong>{formatFuelLiters(totalVolumeLitersMilli)}</strong>
        </div>
        <div className="metric">
          <span>Km calcolati</span>
          <strong>{validKm.toLocaleString('it-IT')}</strong>
        </div>
        <div className="metric">
          <span>Euro/km</span>
          <strong>{formatCostPerKmFromTotals(amountWithKmCents, validKm)}</strong>
        </div>
        <Link className="metric metric-link" href="/fuel?review=needs_review" aria-label="Vedi rifornimenti da verificare">
          <span>Da verificare</span>
          <strong>{reviewCount}</strong>
          <span className="metric-action">
            Vedi anomalie
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
      </section>

      <form className="filter-bar fuel-filter-bar" action="/fuel">
        <label className="fuel-filter-search">
          Cerca
          <input name="q" placeholder="Targa, autista, tessera, distributore" defaultValue={resolvedSearchParams.q || ''} />
        </label>
        <DatePartFilters label="Da" prefix="from" date={fromDate} years={yearOptions} />
        <DatePartFilters label="A" prefix="to" date={toDate} years={yearOptions} />
        <label>
          Targa
          <select name="tractorId" defaultValue={tractorFilter}>
            <option value="">Tutte</option>
            {tractors.map((tractor) => (
              <option key={tractor.id} value={tractor.id}>
                {getVehicleLabel(tractor)}
                {tractor.active ? '' : ' (non attivo)'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Autista
          <select name="driverId" defaultValue={driverFilter}>
            <option value="">Tutti</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {getDriverLabel(driver)}
                {driver.active ? '' : ' (non attivo)'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Distributore
          <select name="fuelSupplierId" defaultValue={supplierFilter}>
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
          Tessera
          <select name="fuelCardId" defaultValue={cardFilter}>
            <option value="">Tutte</option>
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.fuelSupplier?.name || 'Senza distributore'} - {card.cardNumber}
              </option>
            ))}
          </select>
        </label>
        <label>
          Prodotto
          <select name="fuelProductId" defaultValue={productFilter}>
            <option value="">Tutti</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
                {product.active ? '' : ' (non attivo)'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Revisione
          <select name="review" defaultValue={reviewFilter}>
            <option value="">Tutti</option>
            <option value="needs_review">Da verificare</option>
            <option value="verified">Verificati</option>
            <option value="ok">OK</option>
          </select>
        </label>
        <div className="filter-actions">
          <button className="primary-button" type="submit">
            Filtra
          </button>
          <Link className="secondary-button" href="/fuel">
            Reset
          </Link>
          <span className="filter-count">{filteredEntries.length} risultati</span>
        </div>
      </form>

      <section className="detail-section" style={{ marginBottom: 18 }}>
        <h2>Riepilogo per targa</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Targa</th>
                <th>Prodotto</th>
                <th>Rifornimenti</th>
                <th>Litri</th>
                <th>Costo</th>
                <th>Km</th>
                <th>Euro/km</th>
                <th>Consumo</th>
                <th>Anomalie</th>
              </tr>
            </thead>
            <tbody>
              {plateSummaries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty-state">
                    Nessun rifornimento nel filtro.
                  </td>
                </tr>
              ) : (
                plateSummaries.map((summary) => (
                  <tr key={`${summary.plate}|${summary.productCode}`}>
                    <td>
                      <strong>{summary.plate}</strong>
                    </td>
                    <td>{summary.productLabel}</td>
                    <td>{summary.count}</td>
                    <td>{formatFuelLiters(summary.volumeLitersMilli)}</td>
                    <td>{formatFuelMoney(summary.totalAmountCents)}</td>
                    <td>{summary.km.toLocaleString('it-IT')}</td>
                    <td>{formatCostPerKmFromTotals(summary.amountWithKmCents, summary.km)}</td>
                    <td>{formatConsumptionFromTotals(summary.volumeWithKmMilli, summary.km)}</td>
                    <td>{summary.reviewCount || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Targa</th>
              <th>Autista</th>
              <th>Tessera</th>
              <th>Prodotto</th>
              <th>Km</th>
              <th>Litri</th>
              <th>Prezzo</th>
              <th>Costo</th>
              <th>Euro/km</th>
              <th>Stato</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={12} className="empty-state">
                  Nessun rifornimento trovato.
                </td>
              </tr>
            ) : (
              pagination.items.map((entry) => {
                const fuelHref = `/fuel/${entry.id}`;
                return (
                  <tr className="clickable-row" key={entry.id}>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={fuelHref}>
                        {formatDate(entry.fuelDate)}
                        {entry.fuelTime ? <div className="muted">{entry.fuelTime}</div> : null}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={fuelHref}>
                        {getFuelVehicleLabel(entry)}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={fuelHref}>
                        {getFuelDriverLabel(entry)}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={fuelHref}>
                        {entry.fuelSupplier?.name || entry.fuelCard?.fuelSupplier?.name || '-'}
                        <div className="muted">{entry.fuelCard?.cardNumber || entry.cardNumber}</div>
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={fuelHref}>
                        {entry.fuelProduct?.name || entry.productName || entry.productCode}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={fuelHref}>
                        {entry.odometerKm ? `${entry.odometerKm.toLocaleString('it-IT')} km` : '-'}
                        {entry.kmDelta ? <div className="muted">+{entry.kmDelta.toLocaleString('it-IT')} km</div> : null}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={fuelHref}>
                        {formatFuelLiters(entry.volumeLitersMilli)}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={fuelHref}>
                        {formatFuelPrice(entry.grossPricePerLiterMilliEuro)}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={fuelHref}>
                        {formatFuelMoney(entry.totalAmountCents)}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={fuelHref}>
                        {formatFuelCostPerKm(entry.costPerKmMilliEuro)}
                        {entry.litersPer100KmTenths ? <div className="muted">{formatFuelConsumption(entry.litersPer100KmTenths)}</div> : null}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={fuelHref}>
                        <span className={`badge fuel-status-${entry.status.toLowerCase().replace('_', '-')}`}>
                          {entry.status === FuelEntryStatus.NEEDS_REVIEW ? <AlertTriangle size={13} aria-hidden /> : null}
                          {getFuelEntryStatusLabel(entry.status)}
                        </span>
                        {entry.status === FuelEntryStatus.NEEDS_REVIEW && entry.reviewReasons ? (
                          <div className="fuel-review-reason" title={entry.reviewReasons}>
                            {entry.reviewReasons}
                          </div>
                        ) : null}
                      </Link>
                    </td>
                    <td>
                      {entry.importBatch ? (
                        <Link className="secondary-button compact-button" href={`/api/fuel/imports/${entry.importBatch.id}/file`} target="_blank">
                          <Download size={15} aria-hidden />
                          PDF
                        </Link>
                      ) : (
                        <span className="file-missing-pill">Manuale</span>
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
        pathname="/fuel"
        searchParams={resolvedSearchParams}
        to={pagination.to}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
      />
    </>
  );
}
