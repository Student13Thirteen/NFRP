import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { PageHeader } from '@/components/PageHeader';
import { prisma } from '@/lib/db';
import { deleteMaintenanceCategoryAction, updateMaintenanceCategoryAction } from '../../../actions';

type MaintenanceCategoryDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function MaintenanceCategoryDetailPage({ params, searchParams }: MaintenanceCategoryDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { maintenances: true, warehouseItems: true } } }
  });
  if (!category) notFound();

  return (
    <>
      <PageHeader
        title={category.name}
        description={`${category._count.maintenances} manutenzioni, ${category._count.warehouseItems} record magazzino collegati.`}
        action={
          <Link className="secondary-button" href="/maintenances/settings">
            <ArrowLeft size={16} aria-hidden />
            Anagrafiche manutenzioni
          </Link>
        }
      />
      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <section className="panel">
        <h2>Modifica categoria</h2>
        <form action={updateMaintenanceCategoryAction.bind(null, category.id)} className="form-stack">
          <label>
            Nome categoria
            <input name="name" defaultValue={category.name} required />
          </label>
          <label>
            Note
            <textarea name="notes" rows={3} defaultValue={category.notes || ''} />
          </label>
          <label className="checkbox-row">
            <input name="active" type="checkbox" defaultChecked={category.active} />
            Attiva
          </label>
          <button className="primary-button" type="submit">
            <Save size={16} aria-hidden />
            Salva modifiche
          </button>
        </form>
        <div className="record-actions">
          <form action={deleteMaintenanceCategoryAction.bind(null, category.id)}>
            <ConfirmSubmitButton
              className="danger-button"
              message="Eliminare questa categoria? Se ci sono manutenzioni o record magazzino collegati l'operazione verra bloccata."
            >
              <Trash2 size={16} aria-hidden />
              Elimina categoria
            </ConfirmSubmitButton>
          </form>
        </div>
      </section>
    </>
  );
}
