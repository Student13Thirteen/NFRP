import { requireUser } from '@/lib/auth';
import { DocumentStatus, VehicleLifecycleStatus } from '@prisma/client';
import Link from 'next/link';
import { Inbox, Plus } from 'lucide-react';
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
  getDocumentEntityKey
} from '@/lib/documents';
import { buildEntityOptions } from '@/lib/entities';
import { paginateItems } from '@/lib/pagination';
import { getOperationalFleetDocumentWhere } from '@/lib/vehicle-lifecycle';

type DocumentsPageProps = {
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

export default async function DocumentsPage({ searchParams }: DocumentsPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const [documents, documentTypes, drivers, tractors, trailers, otherEntities] = await Promise.all([
    prisma.document.findMany({
      where: {
        AND: [
          { status: { notIn: [DocumentStatus.ARCHIVED, DocumentStatus.RENEWED] } },
          getOperationalFleetDocumentWhere()
        ]
      },
      include: documentInclude,
      orderBy: [{ expiryDate: 'asc' }, { createdAt: 'desc' }]
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
    if (resolvedSearchParams.entityKey) {
      if (getDocumentEntityKey(document) !== resolvedSearchParams.entityKey) return false;
    }
    if (!documentMatchesStatusFilter(document, resolvedSearchParams.status)) return false;
    if (!documentMatchesPdfFilter(document, resolvedSearchParams.pdf)) return false;
    return true;
  });
  const documentTypeOptions = documentTypes.map((documentType) => ({ id: documentType.id, name: documentType.name }));
  const pagination = paginateItems(filteredDocuments, resolvedSearchParams.page, resolvedSearchParams.pageSize);

  return (
    <>
      <PageHeader
        title="Documenti"
        description="Archivio PDF e scadenze."
        action={
          <div className="actions-row">
            <Link className="secondary-button" href="/documents/inbox">
              <Inbox size={16} aria-hidden />
              Inbox PDF
            </Link>
            <Link className="primary-button" href="/documents/new">
              <Plus size={16} aria-hidden />
              Nuovo
            </Link>
          </div>
        }
      />
      <DocumentFilters
        documentTypes={documentTypeOptions}
        entityOptions={entityOptions}
        initialFilters={resolvedSearchParams}
        resultCount={filteredDocuments.length}
      />
      <DocumentTable documents={pagination.items} />
      <TablePagination
        currentPage={pagination.currentPage}
        from={pagination.from}
        pathname="/documents"
        searchParams={resolvedSearchParams}
        to={pagination.to}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
      />
    </>
  );
}
