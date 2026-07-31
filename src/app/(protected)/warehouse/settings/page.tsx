import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { prisma } from '@/lib/db';
import { formatSupplierAddress, formatSupplierContacts } from '@/lib/suppliers';
import { createWarehouseCategoryAction, createWarehouseSupplierAction } from '../actions';

type WarehouseSettingsPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function WarehouseSettingsPage({ searchParams }: WarehouseSettingsPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const [categories, suppliers] = await Promise.all([
    prisma.category.findMany({
      include: { _count: { select: { maintenances: true, warehouseItems: true } } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }]
    }),
    prisma.supplier.findMany({
      include: { _count: { select: { maintenances: true, warehouseItems: true } } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }]
    })
  ]);

  return (
    <>
      <PageHeader
        title="Anagrafiche magazzino"
        description="Categorie e fornitori dedicati ai record di magazzino."
        action={
          <Link className="secondary-button" href="/warehouse">
            <ArrowLeft size={16} aria-hidden />
            Torna al magazzino
          </Link>
        }
      />
      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <div className="grid two">
        <section className="panel">
          <h2>Nuova categoria</h2>
          <form action={createWarehouseCategoryAction} className="form-stack">
            <label>
              Nome categoria
              <input name="name" placeholder="Es. Pneumatici, Ricambi, Olio" required />
            </label>
            <label>
              Note
              <textarea name="notes" rows={3} />
            </label>
            <button className="primary-button" type="submit">
              <Plus size={16} aria-hidden />
              Salva categoria
            </button>
          </form>

          <div className="table-wrap" style={{ marginTop: 18 }}>
            <table>
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Uso</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => {
                  const categoryHref = `/warehouse/settings/categories/${category.id}`;

                  return (
                    <tr className="clickable-row" key={category.id}>
                      <td className="click-cell">
                        <Link className="table-cell-link" href={categoryHref}>
                          <strong>{category.name}</strong>
                          {category.notes ? <div className="muted">{category.notes}</div> : null}
                        </Link>
                      </td>
                      <td className="click-cell">
                        <Link className="table-cell-link" href={categoryHref}>
                          {category._count.maintenances} manut. / {category._count.warehouseItems} mag.
                        </Link>
                      </td>
                      <td className="click-cell">
                        <Link className="table-cell-link" href={categoryHref}>
                          {category.active ? 'Attiva' : 'Non attiva'}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <h2>Nuovo fornitore</h2>
          <form action={createWarehouseSupplierAction} className="form-stack">
            <div className="form-grid">
              <label>
                Nome fornitore
                <input name="name" placeholder="Es. Fornitore ricambi" required />
              </label>
              <label>
                Telefono
                <input name="phone" />
              </label>
              <label>
                Email
                <input name="email" type="email" />
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
              <textarea name="notes" rows={3} />
            </label>
            <button className="primary-button" type="submit">
              <Plus size={16} aria-hidden />
              Salva fornitore
            </button>
          </form>

          <div className="table-wrap" style={{ marginTop: 18 }}>
            <table>
              <thead>
                <tr>
                  <th>Fornitore</th>
                  <th>Contatti</th>
                  <th>Uso</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="empty-state">
                      Nessun fornitore inserito.
                    </td>
                  </tr>
                ) : (
                  suppliers.map((supplier) => {
                    const supplierHref = `/warehouse/settings/suppliers/${supplier.id}`;

                    return (
                      <tr className="clickable-row" key={supplier.id}>
                        <td className="click-cell">
                          <Link className="table-cell-link" href={supplierHref}>
                            <strong>{supplier.name}</strong>
                            {formatSupplierAddress(supplier) ? <div className="muted">{formatSupplierAddress(supplier)}</div> : null}
                          </Link>
                        </td>
                        <td className="click-cell">
                          <Link className="table-cell-link" href={supplierHref}>
                            {formatSupplierContacts(supplier)}
                            {supplier.notes ? <div className="muted">{supplier.notes}</div> : null}
                          </Link>
                        </td>
                        <td className="click-cell">
                          <Link className="table-cell-link" href={supplierHref}>
                            {supplier._count.maintenances} manut. / {supplier._count.warehouseItems} mag.
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
