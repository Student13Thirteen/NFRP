import { requireUser } from '@/lib/auth';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { FilePlus, Save, Trash2 } from 'lucide-react';
import { DocumentTable } from '@/components/DocumentTable';
import { PageHeader } from '@/components/PageHeader';
import { prisma } from '@/lib/db';
import { documentInclude } from '@/lib/documents';
import { deleteDriverAction, updateDriverAction } from '../actions';

type DriverDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DriverDetailPage({ params }: DriverDetailPageProps) {
  await requireUser();
  const { id } = await params;
  const driver = await prisma.driver.findUnique({ where: { id } });
  if (!driver) notFound();

  const documents = await prisma.document.findMany({
    where: { driverId: driver.id },
    include: documentInclude,
    orderBy: { expiryDate: 'asc' }
  });

  return (
    <>
      <PageHeader
        title={`${driver.firstName} ${driver.lastName}`}
        description="Scheda autista"
        action={
          <Link className="primary-button" href={`/documents/new?entityType=DRIVER&entityId=${driver.id}`}>
            <FilePlus size={16} aria-hidden />
            Documento
          </Link>
        }
      />
      <div className="grid two">
        <section className="panel">
          <h2>Dati autista</h2>
          <form action={updateDriverAction.bind(null, driver.id)} className="form-stack">
            <div className="form-grid">
              <label>
                Nome
                <input name="firstName" defaultValue={driver.firstName} required />
              </label>
              <label>
                Cognome
                <input name="lastName" defaultValue={driver.lastName} required />
              </label>
              <label>
                Telefono
                <input name="phone" defaultValue={driver.phone || ''} />
              </label>
              <label>
                Email
                <input name="email" type="email" defaultValue={driver.email || ''} />
              </label>
            </div>
            <label>
              Note
              <textarea name="notes" defaultValue={driver.notes || ''} />
            </label>
            <label className="checkbox-row">
              <input name="active" type="checkbox" defaultChecked={driver.active} />
              Attivo
            </label>
            <div className="actions-row">
              <button className="primary-button" type="submit">
                <Save size={16} aria-hidden />
                Salva
              </button>
            </div>
          </form>
          <form action={deleteDriverAction.bind(null, driver.id)} className="actions-row" style={{ marginTop: 12 }}>
            <button className="danger-button" type="submit">
              <Trash2 size={16} aria-hidden />
              Elimina
            </button>
          </form>
        </section>
        <section className="detail-section">
          <h2>Documenti autista</h2>
          <DocumentTable documents={documents} />
        </section>
      </div>
    </>
  );
}
