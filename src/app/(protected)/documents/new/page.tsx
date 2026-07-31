import { requireUser } from '@/lib/auth';
import { DocumentStatus, EntityType } from '@prisma/client';
import { Save } from 'lucide-react';
import { DatePartsInput } from '@/components/DatePartsInput';
import { EntitySelect } from '@/components/EntitySelect';
import { FileUpload } from '@/components/FileUpload';
import { PageHeader } from '@/components/PageHeader';
import { prisma } from '@/lib/db';
import { getStatusLabel } from '@/lib/documents';
import { buildEntityKey, buildEntityOptions } from '@/lib/entities';

type NewDocumentPageProps = {
  searchParams: Promise<{
    entityType?: string;
    entityId?: string;
    documentTypeId?: string;
    error?: string;
  }>;
};

export default async function NewDocumentPage({ searchParams }: NewDocumentPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const [documentTypes, drivers, tractors, trailers, otherEntities] = await Promise.all([
    prisma.documentType.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.driver.findMany({ where: { active: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.tractor.findMany({ where: { active: true }, orderBy: { plate: 'asc' } }),
    prisma.trailer.findMany({ where: { active: true }, orderBy: { plate: 'asc' } }),
    prisma.otherEntity.findMany({ where: { active: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }] })
  ]);

  const entityOptions = buildEntityOptions({ drivers, tractors, trailers, otherEntities });
  const defaultEntityType = Object.values(EntityType).includes(resolvedSearchParams.entityType as EntityType)
    ? (resolvedSearchParams.entityType as EntityType)
    : undefined;
  const defaultEntityKey =
    defaultEntityType && resolvedSearchParams.entityId ? buildEntityKey(defaultEntityType, resolvedSearchParams.entityId) : undefined;

  return (
    <>
      <PageHeader title="Nuovo documento" description="Imposta scadenza e allega il PDF se disponibile." />
      <section className="panel">
        {resolvedSearchParams.error ? <p className="form-error">{resolvedSearchParams.error}</p> : null}
        <form action="/api/documents/create" method="post" encType="multipart/form-data" className="form-stack" noValidate>
          <div className="form-grid">
            <label>
              Tipo documento
              <select name="documentTypeId" defaultValue={resolvedSearchParams.documentTypeId || documentTypes[0]?.id || ''} required>
                {documentTypes.map((documentType) => (
                  <option key={documentType.id} value={documentType.id}>
                    {documentType.name}
                  </option>
                ))}
              </select>
            </label>
            <EntitySelect options={entityOptions} defaultValue={defaultEntityKey} />
            <FileUpload label="File PDF opzionale" name="file" />
            <DatePartsInput label="Data emissione" name="issueDate" />
            <DatePartsInput label="Data scadenza" name="expiryDate" required />
            <label>
              Giorni preavviso
              <input name="noticeDays" type="number" min={1} defaultValue={30} required />
            </label>
            <label>
              Stato
              <select name="status" defaultValue={DocumentStatus.VALID}>
                {[DocumentStatus.VALID, DocumentStatus.EXPIRING, DocumentStatus.EXPIRED, DocumentStatus.ARCHIVED].map((status) => (
                  <option key={status} value={status}>
                    {getStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Costo associato (€)
              <input name="amount" inputMode="decimal" placeholder="Es. 13,00" />
            </label>
          </div>
          <label>
            Note
            <textarea name="notes" />
          </label>
          <button className="primary-button" type="submit">
            <Save size={16} aria-hidden />
            Salva documento
          </button>
        </form>
      </section>
    </>
  );
}
