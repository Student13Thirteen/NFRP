import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { RegistryTable, type RegistryTableRow } from '@/components/RegistrySearch';
import { prisma } from '@/lib/db';
import { buildRegistrySearchText } from '@/lib/registry-search';

export default async function OthersPage() {
  await requireUser();
  const entities = await prisma.otherEntity.findMany({
    orderBy: [{ active: 'desc' }, { category: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { documents: true } } }
  });

  const rows: RegistryTableRow[] = entities.map((entity) => {
    const href = `/others/${entity.id}`;
    const statusLabel = entity.active ? 'Attivo' : 'Non attivo';

    return {
      id: entity.id,
      search: buildRegistrySearchText([entity.name, entity.category, entity.notes, statusLabel]),
      cells: (
        <>
          <td className="click-cell">
            <Link className="table-cell-link" href={href}>
              <strong>{entity.name}</strong>
              {entity.notes ? <div className="muted">{entity.notes}</div> : null}
            </Link>
          </td>
          <td className="click-cell">
            <Link className="table-cell-link" href={href}>{entity.category}</Link>
          </td>
          <td className="click-cell">
            <Link className="table-cell-link" href={href}>{statusLabel}</Link>
          </td>
          <td className="click-cell">
            <Link className="table-cell-link" href={href}>{entity._count.documents}</Link>
          </td>
        </>
      )
    };
  });

  return (
    <>
      <PageHeader
        title="Altro"
        description="Entità generiche: porti, clienti, permessi speciali e altri riferimenti."
        action={
          <Link className="primary-button" href="/others/new">
            <Plus size={16} aria-hidden />
            Nuova entità
          </Link>
        }
      />
      <RegistryTable
        rows={rows}
        columnCount={4}
        searchLabel="Cerca entità"
        searchPlaceholder="Nome, categoria, note..."
        entityLabel="entità"
        emptyText="Nessuna entità registrata. Usa Nuova entità per inserire la prima."
        head={
          <tr>
            <th>Nome</th>
            <th>Categoria</th>
            <th>Stato</th>
            <th>Documenti</th>
          </tr>
        }
      />
    </>
  );
}
