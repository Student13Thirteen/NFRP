import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { prisma } from '@/lib/db';
import { formatTripAddress } from '@/lib/trips';
import { createLoadingBaseAction, createSalesPointAction, createTripProductAction } from '../actions';

type TripSettingsPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function TripSettingsPage({ searchParams }: TripSettingsPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const [loadingBases, salesPoints, products] = await Promise.all([
    prisma.loadingBase.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.salesPoint.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }, { plantCode: 'asc' }] }),
    prisma.tripProduct.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] })
  ]);

  return (
    <>
      <PageHeader
        title="Basi, punti vendita e prodotti"
        description="Anagrafiche usate nei menu a tendina dei viaggi."
        action={
          <Link className="secondary-button" href="/trips">
            <ArrowLeft size={16} aria-hidden />
            Viaggi
          </Link>
        }
      />
      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <div className="grid three">
        <section className="panel">
          <h2>Nuova base di carico</h2>
          <form action={createLoadingBaseAction} className="form-stack">
            <div className="form-grid">
              <label>
                Nome
                <input name="name" required />
              </label>
              <label>
                Via / indirizzo
                <input name="address" />
              </label>
              <label>
                CAP
                <input name="postalCode" />
              </label>
              <label>
                Citta
                <input name="city" />
              </label>
              <label>
                Provincia
                <input name="province" />
              </label>
              <label>
                Nazione
                <input name="country" />
              </label>
            </div>
            <label>
              Note
              <textarea name="notes" />
            </label>
            <button className="primary-button" type="submit">
              <Plus size={16} aria-hidden />
              Salva base
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>Nuovo punto vendita</h2>
          <form action={createSalesPointAction} className="form-stack">
            <div className="form-grid">
              <label>
                Nome
                <input name="name" required />
              </label>
              <label>
                Codice impianto
                <input name="plantCode" />
              </label>
              <label>
                Localita
                <input name="city" />
              </label>
              <label>
                Via / indirizzo
                <input name="address" />
              </label>
              <label>
                CAP
                <input name="postalCode" />
              </label>
              <label>
                Provincia
                <input name="province" />
              </label>
              <label>
                Nazione
                <input name="country" />
              </label>
            </div>
            <label>
              Note
              <textarea name="notes" />
            </label>
            <button className="primary-button" type="submit">
              <Plus size={16} aria-hidden />
              Salva punto vendita
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>Nuovo prodotto</h2>
          <form action={createTripProductAction} className="form-stack">
            <div className="form-grid">
              <label>
                Nome
                <input name="name" required />
              </label>
              <label>
                Unita
                <input name="unitLabel" defaultValue="L" required />
              </label>
            </div>
            <label>
              Note
              <textarea name="notes" />
            </label>
            <button className="primary-button" type="submit">
              <Plus size={16} aria-hidden />
              Salva prodotto
            </button>
          </form>
        </section>
      </div>

      <div className="grid three" style={{ marginTop: 18 }}>
        <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Base</th>
                <th>Indirizzo</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {loadingBases.length === 0 ? (
                <tr>
                  <td className="empty-state" colSpan={3}>
                    Nessuna base inserita.
                  </td>
                </tr>
              ) : (
                loadingBases.map((loadingBase) => {
                  const loadingBaseHref = `/trips/settings/loading-bases/${loadingBase.id}`;

                  return (
                    <tr className="clickable-row" key={loadingBase.id}>
                      <td className="click-cell">
                        <Link className="table-cell-link" href={loadingBaseHref}>
                          <strong>{loadingBase.name}</strong>
                        </Link>
                      </td>
                      <td className="click-cell">
                        <Link className="table-cell-link" href={loadingBaseHref}>
                          {formatTripAddress(loadingBase) || '-'}
                        </Link>
                      </td>
                      <td className="click-cell">
                        <Link className="table-cell-link" href={loadingBaseHref}>
                          {loadingBase.active ? 'Attiva' : 'Non attiva'}
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>

        <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Punto vendita</th>
                <th>Codice</th>
                <th>Localita</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {salesPoints.length === 0 ? (
                <tr>
                  <td className="empty-state" colSpan={4}>
                    Nessun punto vendita inserito.
                  </td>
                </tr>
              ) : (
                salesPoints.map((salesPoint) => {
                  const salesPointHref = `/trips/settings/sales-points/${salesPoint.id}`;

                  return (
                    <tr className="clickable-row" key={salesPoint.id}>
                      <td className="click-cell">
                        <Link className="table-cell-link" href={salesPointHref}>
                          <strong>{salesPoint.name}</strong>
                          {formatTripAddress(salesPoint) ? <div className="muted">{formatTripAddress(salesPoint)}</div> : null}
                        </Link>
                      </td>
                      <td className="click-cell">
                        <Link className="table-cell-link" href={salesPointHref}>
                          {salesPoint.plantCode || '-'}
                        </Link>
                      </td>
                      <td className="click-cell">
                        <Link className="table-cell-link" href={salesPointHref}>
                          {[salesPoint.city, salesPoint.province].filter(Boolean).join(' ') || '-'}
                        </Link>
                      </td>
                      <td className="click-cell">
                        <Link className="table-cell-link" href={salesPointHref}>
                          {salesPoint.active ? 'Attivo' : 'Non attivo'}
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>

        <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Prodotto</th>
                <th>Unita</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td className="empty-state" colSpan={3}>
                    Nessun prodotto inserito.
                  </td>
                </tr>
              ) : (
                products.map((product) => {
                  const productHref = `/trips/settings/products/${product.id}`;

                  return (
                    <tr className="clickable-row" key={product.id}>
                      <td className="click-cell">
                        <Link className="table-cell-link" href={productHref}>
                          <strong>{product.name}</strong>
                          {product.notes ? <div className="muted">{product.notes}</div> : null}
                        </Link>
                      </td>
                      <td className="click-cell">
                        <Link className="table-cell-link" href={productHref}>
                          {product.unitLabel}
                        </Link>
                      </td>
                      <td className="click-cell">
                        <Link className="table-cell-link" href={productHref}>
                          {product.active ? 'Attivo' : 'Non attivo'}
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
