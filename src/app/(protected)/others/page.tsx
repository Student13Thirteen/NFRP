import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { prisma } from '@/lib/db';
import { createOtherEntityAction } from './actions';

export default async function OthersPage() {
  await requireUser();
  const entities = await prisma.otherEntity.findMany({
    orderBy: [{ active: 'desc' }, { category: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { documents: true } } }
  });

  return (
    <>
      <PageHeader title="Altro" description="Entità generiche: porti, clienti, permessi speciali e altri riferimenti." />
      <div className="grid two">
        <section className="panel">
          <h2>Nuova entità</h2>
          <form action={createOtherEntityAction} className="form-stack">
            <div className="form-grid">
              <label>
                Nome
                <input name="name" required />
              </label>
              <label>
                Categoria
                <input name="category" placeholder="Porto, Azienda, Cliente..." required />
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
                <th>Nome</th>
                <th>Categoria</th>
                <th>Stato</th>
                <th>Documenti</th>
              </tr>
            </thead>
            <tbody>
              {entities.map((entity) => (
                <tr key={entity.id}>
                  <td>
                    <Link href={`/others/${entity.id}`}>
                      <strong>{entity.name}</strong>
                    </Link>
                    {entity.notes ? <div className="muted">{entity.notes}</div> : null}
                  </td>
                  <td>{entity.category}</td>
                  <td>{entity.active ? 'Attivo' : 'Non attivo'}</td>
                  <td>{entity._count.documents}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
