import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { CreditCard, Droplet, Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { prisma } from '@/lib/db';
import { getVehicleLabel } from '@/lib/trips';
import { createFuelCardAction, createFuelProductAction, createFuelSupplierAction } from './actions';

type FuelSettingsPageProps = {
  searchParams: Promise<{ error?: string }>;
};

function activeLabel(active: boolean): string {
  return active ? 'Attivo' : 'Non attivo';
}

function supplierLabel(supplier: { name: string } | null): string {
  return supplier?.name || 'Senza distributore';
}

export default async function FuelSettingsPage({ searchParams }: FuelSettingsPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const [suppliers, cards, products, tractors] = await Promise.all([
    prisma.fuelSupplier.findMany({
      include: { _count: { select: { cards: true, entries: true, batches: true } } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }]
    }),
    prisma.fuelCard.findMany({
      include: { fuelSupplier: true, assignedTractor: true, _count: { select: { entries: true } } },
      orderBy: [{ active: 'desc' }, { fuelSupplier: { name: 'asc' } }, { cardNumber: 'asc' }]
    }),
    prisma.fuelProduct.findMany({
      include: { _count: { select: { entries: true } } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }, { code: 'asc' }]
    }),
    prisma.tractor.findMany({ orderBy: [{ active: 'desc' }, { plate: 'asc' }] })
  ]);

  return (
    <>
      <PageHeader
        title="Anagrafiche rifornimenti"
        description="Prodotti, tessere e distributori usati nei rifornimenti."
        action={
          <Link className="secondary-button" href="/fuel">
            Rifornimenti
          </Link>
        }
      />
      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <div className="grid three">
        <section className="panel">
          <h2>Nuovo prodotto</h2>
          <form action={createFuelProductAction} className="form-stack">
            <div className="form-grid">
              <label>
                Codice
                <input name="code" placeholder="GLS" required />
              </label>
              <label>
                Nome
                <input name="name" placeholder="Gasolio" required />
              </label>
            </div>
            <label>
              Note
              <textarea name="notes" rows={3} />
            </label>
            <label className="checkbox-row">
              <input name="isFuel" type="checkbox" defaultChecked />
              A consumo (calcola €/km e consumo). Spuntato per gasolio, AdBlue, metano…; togli per servizi come autolavaggio o penali.
            </label>
            <button className="primary-button" type="submit">
              <Droplet size={16} aria-hidden />
              Salva prodotto
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>Nuova tessera</h2>
          <form action={createFuelCardAction} className="form-stack">
            <label>
              Numero o nome tessera
              <input name="cardNumber" placeholder="Es. 123456 o Energia Demo S.R.L." required />
            </label>
            <label>
              Distributore
              <select name="fuelSupplierId" defaultValue="">
                <option value="">Nessuno</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                    {supplier.active ? '' : ' (non attivo)'}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                Etichetta
                <input name="label" placeholder="Targa o descrizione" />
              </label>
              <label>
                Trattore
                <select name="assignedTractorId" defaultValue="">
                  <option value="">Nessuno</option>
                  {tractors.map((tractor) => (
                    <option key={tractor.id} value={tractor.id}>
                      {getVehicleLabel(tractor)}
                      {tractor.active ? '' : ' (non attivo)'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Note
              <textarea name="notes" rows={3} />
            </label>
            <button className="primary-button" type="submit">
              <CreditCard size={16} aria-hidden />
              Salva tessera
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>Nuovo distributore</h2>
          <form action={createFuelSupplierAction} className="form-stack">
            <label>
              Nome
              <input name="name" placeholder="FuelCo, Eni, IP" required />
            </label>
            <label>
              Note
              <textarea name="notes" rows={5} />
            </label>
            <button className="primary-button" type="submit">
              <Plus size={16} aria-hidden />
              Salva distributore
            </button>
          </form>
        </section>
      </div>

      <section className="detail-section" style={{ marginTop: 18 }}>
        <h2>Prodotti</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Codice</th>
                <th>Prodotto</th>
                <th>Tipo</th>
                <th>Rifornimenti</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-state">
                    Nessun prodotto inserito.
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr className="clickable-row" key={product.id}>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={`/fuel/settings/products/${product.id}`}>
                        <strong>{product.code}</strong>
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={`/fuel/settings/products/${product.id}`}>
                        {product.name}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={`/fuel/settings/products/${product.id}`}>
                        {product.isFuel ? 'A consumo' : 'Servizio'}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={`/fuel/settings/products/${product.id}`}>
                        {product._count.entries}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={`/fuel/settings/products/${product.id}`}>
                        {activeLabel(product.active)}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="detail-section" style={{ marginTop: 18 }}>
        <h2>Tessere carburante</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tessera</th>
                <th>Distributore</th>
                <th>Trattore</th>
                <th>Rifornimenti</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {cards.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-state">
                    Nessuna tessera carburante inserita.
                  </td>
                </tr>
              ) : (
                cards.map((card) => (
                  <tr className="clickable-row" key={card.id}>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={`/fuel/settings/cards/${card.id}`}>
                        <strong>{card.cardNumber}</strong>
                        {card.label ? <div className="muted">{card.label}</div> : null}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={`/fuel/settings/cards/${card.id}`}>
                        {supplierLabel(card.fuelSupplier)}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={`/fuel/settings/cards/${card.id}`}>
                        {card.assignedTractor ? getVehicleLabel(card.assignedTractor) : '-'}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={`/fuel/settings/cards/${card.id}`}>
                        {card._count.entries}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={`/fuel/settings/cards/${card.id}`}>
                        {activeLabel(card.active)}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="detail-section" style={{ marginTop: 18 }}>
        <h2>Distributori</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tessere</th>
                <th>Rifornimenti</th>
                <th>Import PDF</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-state">
                    Nessun distributore inserito.
                  </td>
                </tr>
              ) : (
                suppliers.map((supplier) => (
                  <tr className="clickable-row" key={supplier.id}>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={`/fuel/settings/suppliers/${supplier.id}`}>
                        <strong>{supplier.name}</strong>
                        {supplier.notes ? <div className="muted">{supplier.notes}</div> : null}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={`/fuel/settings/suppliers/${supplier.id}`}>
                        {supplier._count.cards}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={`/fuel/settings/suppliers/${supplier.id}`}>
                        {supplier._count.entries}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={`/fuel/settings/suppliers/${supplier.id}`}>
                        {supplier._count.batches}
                      </Link>
                    </td>
                    <td className="click-cell">
                      <Link className="table-cell-link" href={`/fuel/settings/suppliers/${supplier.id}`}>
                        {activeLabel(supplier.active)}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
