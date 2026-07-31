import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FilePlus, Save, Trash2 } from 'lucide-react';
import { DocumentTable } from '@/components/DocumentTable';
import { PageHeader } from '@/components/PageHeader';
import { prisma } from '@/lib/db';
import { documentInclude } from '@/lib/documents';
import { deleteOtherEntityAction, updateOtherEntityAction } from '../actions';

type OtherEntityDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function OtherEntityDetailPage({ params }: OtherEntityDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const entity = await prisma.otherEntity.findUnique({ where: { id } });
  if (!entity) notFound();

  const documents = await prisma.document.findMany({
    where: { otherEntityId: entity.id },
    include: documentInclude,
    orderBy: { expiryDate: 'asc' }
  });

  return (
    <>
      <PageHeader
        title={entity.name}
        description={entity.category}
        action={
          <Link className="primary-button" href={`/documents/new?entityType=OTHER&entityId=${entity.id}`}>
            <FilePlus size={16} aria-hidden />
            Documento
          </Link>
        }
      />
      <div className="grid two">
        <section className="panel">
          <h2>Dati entità</h2>
          <form action={updateOtherEntityAction.bind(null, entity.id)} className="form-stack">
            <div className="form-grid">
              <label>
                Nome
                <input name="name" defaultValue={entity.name} required />
              </label>
              <label>
                Categoria
                <input name="category" defaultValue={entity.category} required />
              </label>
            </div>
            <label>
              Note
              <textarea name="notes" defaultValue={entity.notes || ''} />
            </label>
            <label className="checkbox-row">
              <input name="active" type="checkbox" defaultChecked={entity.active} />
              Attivo
            </label>
            <button className="primary-button" type="submit">
              <Save size={16} aria-hidden />
              Salva
            </button>
          </form>
          <form action={deleteOtherEntityAction.bind(null, entity.id)} className="actions-row" style={{ marginTop: 12 }}>
            <button className="danger-button" type="submit">
              <Trash2 size={16} aria-hidden />
              Elimina
            </button>
          </form>
        </section>
        <section className="detail-section">
          <h2>Documenti associati</h2>
          <DocumentTable documents={documents} />
        </section>
      </div>
    </>
  );
}
