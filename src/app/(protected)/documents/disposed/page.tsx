import { requireUser } from '@/lib/auth';
import { DocumentStatus, VehicleLifecycleStatus } from '@prisma/client';
import Link from 'next/link';
import { FileText, History } from 'lucide-react';
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
import {
  getDisposedFleetDocumentWhere,
  getVehicleLifecycleLabel,
  isDisposedVehicleStatus
} from '@/lib/vehicle-lifecycle';

type DisposedDocumentsPageProps = {
  searchParams: Promise<{
    documentTypeId?: string;
    entityKey?: string;
    page?: string;
    pageSize?: string;
    pdf?: string;
    q?: string;
    status?: string;
    vehicleStatus?: string;
  }>;
};

export default async function DisposedDocumentsPage({ searchParams }: DisposedDocumentsPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const requestedVehicleStatus = Object.values(VehicleLifecycleStatus).includes(
    resolvedSearchParams.vehicleStatus as VehicleLifecycleStatus
  )
    ? (resolvedSearchParams.vehicleStatus as VehicleLifecycleStatus)
    : undefined;
  const vehicleStatus = requestedVehicleStatus && isDisposedVehicleStatus(requestedVehicleStatus)
    ? requestedVehicleStatus
    : undefined;

  const [documents, documentTypes, tractors, trailers] = await Promise.all([
    prisma.document.findMany({
      where: getDisposedFleetDocumentWhere(vehicleStatus),
      include: documentInclude,
      orderBy: [{ updatedAt: 'desc' }, { expiryDate: 'desc' }]
    }),
    prisma.documentType.findMany({ orderBy: { name: 'asc' } }),
    prisma.tractor.findMany({
      where: { lifecycleStatus: { in: [VehicleLifecycleStatus.SOLD, VehicleLifecycleStatus.SCRAPPED] } },
      orderBy: { plate: 'asc' }
    }),
    prisma.trailer.findMany({
      where: { lifecycleStatus: { in: [VehicleLifecycleStatus.SOLD, VehicleLifecycleStatus.SCRAPPED] } },
      orderBy: { plate: 'asc' }
    })
  ]);

  const entityOptions = buildEntityOptions({ drivers: [], tractors, trailers, otherEntities: [] });
  const filteredDocuments = documents.filter((document) => {
    if (!documentMatchesSearch(document, resolvedSearchParams.q)) return false;
    if (resolvedSearchParams.documentTypeId && document.documentTypeId !== resolvedSearchParams.documentTypeId) return false;
    if (resolvedSearchParams.entityKey && getDocumentEntityKey(document) !== resolvedSearchParams.entityKey) return false;
    if (!documentMatchesStatusFilter(document, resolvedSearchParams.status)) return false;
    if (!documentMatchesPdfFilter(document, resolvedSearchParams.pdf)) return false;
    return true;
  });
  const pagination = paginateItems(filteredDocuments, resolvedSearchParams.page, resolvedSearchParams.pageSize);
  const statusOptions = [
    { value: DocumentStatus.ARCHIVED, label: getStatusLabel(DocumentStatus.ARCHIVED) },
    { value: DocumentStatus.RENEWED, label: getStatusLabel(DocumentStatus.RENEWED) },
    { value: 'expired', label: 'Scaduti' },
    { value: 'valid', label: 'Validi' }
  ];
  const vehicleStatusOptions = [VehicleLifecycleStatus.SOLD, VehicleLifecycleStatus.SCRAPPED].map((status) => ({
    value: status,
    label: getVehicleLifecycleLabel(status)
  }));

  return (
    <>
      <PageHeader
        title="Documenti mezzi usciti"
        description="PDF e scadenze dei trattori e semirimorchi venduti o rottamati. Non incidono sull'operativita e sulle notifiche."
        action={
          <div className="actions-row">
            <Link className="secondary-button" href="/documents/history"><History size={16} aria-hidden />Storico rinnovi</Link>
            <Link className="secondary-button" href="/documents"><FileText size={16} aria-hidden />Documenti attivi</Link>
          </div>
        }
      />
      <DocumentFilters
        documentTypes={documentTypes.map((documentType) => ({ id: documentType.id, name: documentType.name }))}
        entityOptions={entityOptions}
        initialFilters={resolvedSearchParams}
        resultCount={filteredDocuments.length}
        statusOptions={statusOptions}
        vehicleStatusOptions={vehicleStatusOptions}
      />
      <DocumentTable documents={pagination.items} emptyText="Nessun documento di mezzi venduti o rottamati." />
      <TablePagination
        currentPage={pagination.currentPage}
        from={pagination.from}
        pathname="/documents/disposed"
        searchParams={resolvedSearchParams}
        to={pagination.to}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
      />
    </>
  );
}
