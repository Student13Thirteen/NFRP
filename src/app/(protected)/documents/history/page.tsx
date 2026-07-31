import { requireUser } from '@/lib/auth';
import { DocumentStatus, VehicleLifecycleStatus } from '@prisma/client';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { DocumentFilters } from '@/components/DocumentFilters';
import { DocumentTable } from '@/components/DocumentTable';
import { PageHeader } from '@/components/PageHeader';
import { TablePagination } from '@/components/TablePagination';
import { prisma } from '@/lib/db';
import {
  documentInclude,
  documentMatchesPdfFilter,
  documentMatchesSearch,
  documentMatchesStatusFilter,
  getDocumentEntityKey,
  getStatusLabel
} from '@/lib/documents';
import { buildEntityOptions } from '@/lib/entities';
import { paginateItems } from '@/lib/pagination';
import { getOperationalFleetDocumentWhere } from '@/lib/vehicle-lifecycle';

type DocumentsHistoryPageProps = {
  searchParams: Promise<{
    q?: string;
    documentTypeId?: string;
    entityKey?: string;
    status?: string;
    pdf?: string;
    page?: string;
    pageSize?: string;
  }>;
};

export default async function DocumentsHistoryPage({ searchParams }: DocumentsHistoryPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const [documents, documentTypes, drivers, tractors, trailers, otherEntities] = await Promise.all([
    prisma.document.findMany({
      where: {
        AND: [
          { status: { in: [DocumentStatus.ARCHIVED, DocumentStatus.RENEWED] } },
          getOperationalFleetDocumentWhere()
        ]
      },
      include: documentInclude,
      orderBy: [{ updatedAt: 'desc' }, { expiryDate: 'desc' }]
    }),
    prisma.documentType.findMany({ orderBy: { name: 'asc' } }),
    prisma.driver.findMany({ orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.tractor.findMany({
      where: { lifecycleStatus: { notIn: [VehicleLifecycleStatus.SOLD, VehicleLifecycleStatus.SCRAPPED] } },
      orderBy: [{ active: 'desc' }, { plate: 'asc' }]
    }),
    prisma.trailer.findMany({
      where: { lifecycleStatus: { notIn: [VehicleLifecycleStatus.SOLD, VehicleLifecycleStatus.SCRAPPED] } },
      orderBy: [{ active: 'desc' }, { plate: 'asc' }]
    }),
    prisma.otherEntity.findMany({ orderBy: [{ active: 'desc' }, { category: 'asc' }, { name: 'asc' }] })
  ]);

  const entityOptions = buildEntityOptions({ drivers, tractors, trailers, otherEntities });
  const filteredDocuments = documents.filter((document) => {
    if (!documentMatchesSearch(document, resolvedSearchParams.q)) return false;
    if (resolvedSearchParams.documentTypeId && document.documentTypeId !== resolvedSearchParams.documentTypeId) return false;
    if (resolvedSearchParams.entityKey && getDocumentEntityKey(document) !== resolvedSearchParams.entityKey) return false;
    if (!documentMatchesStatusFilter(document, resolvedSearchParams.status)) return false;
    if (!documentMatchesPdfFilter(document, resolvedSearchParams.pdf)) return false;
    return true;
  });
  const documentTypeOptions = documentTypes.map((documentType) => ({ id: documentType.id, name: documentType.name }));
  const historyStatusOptions = [DocumentStatus.RENEWED, DocumentStatus.ARCHIVED].map((status) => ({
    value: status,
    label: getStatusLabel(status)
  }));
  const pagination = paginateItems(filteredDocuments, resolvedSearchParams.page, resolvedSearchParams.pageSize);

  return (
    <>
      <PageHeader
        title="Documenti scaduti (storico)"
        description="Documenti rinnovati o archiviati, consultabili senza incidere su scadenze e notifiche."
        action={
          <Link className="secondary-button" href="/documents">
            <FileText size={16} aria-hidden />
            Documenti attivi
          </Link>
        }
      />
      <DocumentFilters
        documentTypes={documentTypeOptions}
        entityOptions={entityOptions}
        initialFilters={resolvedSearchParams}
        resultCount={filteredDocuments.length}
        statusOptions={historyStatusOptions}
      />
      <DocumentTable documents={pagination.items} emptyText="Nessun documento nello storico." />
      <TablePagination
        currentPage={pagination.currentPage}
        from={pagination.from}
        pathname="/documents/history"
        searchParams={resolvedSearchParams}
        to={pagination.to}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
      />
    </>
  );
}
