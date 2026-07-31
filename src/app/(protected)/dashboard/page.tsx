import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowRight, CircleCheckBig, FilePlus, FileUp, Fuel, Landmark, MapPinned, ReceiptText, Route, ScanLine, Warehouse, Wrench } from 'lucide-react';
import { DocumentTable } from '@/components/DocumentTable';
import { PageHeader } from '@/components/PageHeader';
import { daysUntil } from '@/lib/dates';
import { prisma } from '@/lib/db';
import {
  documentInclude,
  getDocumentVisualStatus
} from '@/lib/documents';
import { getOperationalFleetDocumentWhere } from '@/lib/vehicle-lifecycle';

export default async function DashboardPage() {
  await requireUser();
  const [documents, documentQueue, tripQueue, fuelQueue, tollQueue, expenseQueue, leaseContractQueue, leaseInvoiceQueue, fuelWarnings, tollWarnings, tripsToBill, maintenanceOpen, stockWarnings] = await Promise.all([
    prisma.document.findMany({
      where: getOperationalFleetDocumentWhere(),
      include: documentInclude,
      orderBy: [{ expiryDate: 'asc' }, { createdAt: 'desc' }]
    }),
    prisma.documentInboxItem.count({ where: { status: 'PENDING' } }),
    prisma.tripImportRow.count({ where: { status: 'PENDING' } }),
    prisma.fuelEntry.count({ where: { status: 'PENDING' } }),
    prisma.tollEntry.count({ where: { status: 'PENDING' } }),
    prisma.expenseDocument.count({ where: { status: 'PENDING', source: { not: 'LEASE_INVOICE_IMPORT' } } }),
    prisma.leaseContract.count({ where: { status: 'PENDING' } }),
    prisma.expenseDocument.count({ where: { status: 'PENDING', source: 'LEASE_INVOICE_IMPORT' } }),
    prisma.fuelEntry.count({ where: { status: 'NEEDS_REVIEW' } }),
    prisma.tollEntry.count({ where: { status: 'NEEDS_REVIEW' } }),
    prisma.trip.count({ where: { billingStatus: 'TO_BILL', status: { not: 'CANCELLED' } } }),
    prisma.maintenance.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    prisma.warehouseItem.count({ where: { status: { in: ['LOW_STOCK', 'OUT_OF_STOCK'] } } })
  ]);

  const activeDocuments = documents.filter((document) => getDocumentVisualStatus(document) !== 'inactive');
  const counts = {
    expired: activeDocuments.filter((document) => daysUntil(document.expiryDate) < 0).length,
    sevenDays: activeDocuments.filter((document) => {
      const days = daysUntil(document.expiryDate);
      return days >= 0 && days <= 7;
    }).length,
    thirtyDays: activeDocuments.filter((document) => {
      const days = daysUntil(document.expiryDate);
      return days >= 0 && days <= 30;
    }).length,
    valid: activeDocuments.filter((document) => daysUntil(document.expiryDate) > 30).length,
    missingPdf: activeDocuments.filter((document) => !document.filePath).length
  };

  const urgentDocuments = documents
    .filter((document) => {
      const visualStatus = getDocumentVisualStatus(document);
      return visualStatus === 'expired' || visualStatus === 'sevenDays' || visualStatus === 'thirtyDays';
    })
    .slice(0, 30);
  const leaseQueue = leaseContractQueue + leaseInvoiceQueue;
  const acquisitionQueue = documentQueue + tripQueue + fuelQueue + tollQueue + expenseQueue + leaseQueue;
  const priorities = [
    {
      href: '/acquisitions',
      label: 'Acquisizioni da controllare',
      detail: 'Documenti, bolle, rifornimenti, pedaggi, leasing e manutenzioni',
      value: acquisitionQueue,
      icon: ScanLine,
      tone: acquisitionQueue > 0 ? 'warning' : 'ok'
    },
    {
      href: '/trips?q=Da+fatturare',
      label: 'Viaggi da fatturare',
      detail: 'Prestazioni pronte per il ciclo attivo',
      value: tripsToBill,
      icon: ReceiptText,
      tone: tripsToBill > 0 ? 'info' : 'ok'
    },
    {
      href: '/fuel?review=needs_review',
      label: 'Rifornimenti da verificare',
      detail: 'Km o consumi con controllo richiesto',
      value: fuelWarnings,
      icon: Fuel,
      tone: fuelWarnings > 0 ? 'danger' : 'ok'
    },
    {
      href: '/tolls?status=needs_review',
      label: 'Pedaggi da verificare',
      detail: 'Tessere o targhe con avvisi',
      value: tollWarnings,
      icon: Route,
      tone: tollWarnings > 0 ? 'danger' : 'ok'
    },
    {
      href: '/maintenances?status=OPEN',
      label: 'Manutenzioni aperte',
      detail: 'Interventi aperti o in lavorazione',
      value: maintenanceOpen,
      icon: Wrench,
      tone: maintenanceOpen > 0 ? 'warning' : 'ok'
    },
    {
      href: '/warehouse?status=LOW_STOCK',
      label: 'Scorte critiche',
      detail: 'Articoli sotto soglia o esauriti',
      value: stockWarnings,
      icon: Warehouse,
      tone: stockWarnings > 0 ? 'warning' : 'ok'
    }
  ];
  const attentionPriorities = priorities.filter((priority) => priority.value > 0);
  const attentionCount = attentionPriorities.reduce((sum, item) => sum + item.value, 0);

  return (
    <>
      <PageHeader
        title="Quadro operativo"
        description="Priorita della flotta, scadenze e attivita da completare."
        action={
          <div className="actions-row">
            <Link className="primary-button" href="/acquisitions">
              <ScanLine size={16} aria-hidden />
              Acquisisci
            </Link>
            <Link className="secondary-button" href="/documents/new">
              <FilePlus size={16} aria-hidden />
              Nuovo documento
            </Link>
          </div>
        }
      />

      <section className="priority-board" aria-label="Priorita operative">
        <div className="priority-board-heading">
          <div>
            <span className="section-kicker">Da fare</span>
            <h2>Richiede attenzione</h2>
          </div>
          <span>{attentionCount} attivita</span>
        </div>
        {attentionPriorities.length > 0 ? (
          <div className="priority-list">
          {attentionPriorities.map((priority) => {
            const Icon = priority.icon;
            return (
              <Link className={`priority-item tone-${priority.tone}`} href={priority.href} key={priority.label}>
                <span className="priority-icon"><Icon size={18} aria-hidden /></span>
                <span className="priority-copy">
                  <strong>{priority.label}</strong>
                  <small>{priority.detail}</small>
                </span>
                <b>{priority.value}</b>
                <ArrowRight size={15} aria-hidden />
              </Link>
            );
          })}
          </div>
        ) : (
          <div className="priority-clear">
            <CircleCheckBig size={22} aria-hidden />
            <span><strong>Tutto sotto controllo</strong><small>Non ci sono attivita operative in attesa.</small></span>
          </div>
        )}
      </section>

      <section className="quick-action-strip" aria-label="Azioni frequenti">
        <Link href="/trips/new"><MapPinned size={17} aria-hidden /><span>Nuovo viaggio</span></Link>
        <Link href="/fuel/new"><Fuel size={17} aria-hidden /><span>Nuovo rifornimento</span></Link>
        <Link href="/maintenances/expenses/import"><FileUp size={17} aria-hidden /><span>Importa manutenzioni</span></Link>
        <Link href="/leases/import"><Landmark size={17} aria-hidden /><span>Importa leasing</span></Link>
        <Link href="/maintenances/new"><Wrench size={17} aria-hidden /><span>Nuovo intervento</span></Link>
      </section>

      <div className="section-heading-inline">
        <div>
          <span className="section-kicker">Documenti flotta</span>
          <h2>Scadenze</h2>
        </div>
        <Link href="/documents">Apri archivio <ArrowRight size={14} aria-hidden /></Link>
      </div>

      <section className="metrics" aria-label="Riepilogo scadenze">
        <Link className="metric metric-link" href="/documents?status=expired" aria-label="Vedi documenti scaduti">
          <span>Scaduti</span>
          <strong>{counts.expired}</strong>
          <span className="metric-action">
            Vedi documenti
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
        <Link className="metric metric-link" href="/documents?status=sevenDays" aria-label="Vedi documenti in scadenza entro 7 giorni">
          <span>Entro 7 giorni</span>
          <strong>{counts.sevenDays}</strong>
          <span className="metric-action">
            Vedi documenti
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
        <Link className="metric metric-link" href="/documents?status=within30" aria-label="Vedi documenti in scadenza entro 30 giorni">
          <span>Entro 30 giorni</span>
          <strong>{counts.thirtyDays}</strong>
          <span className="metric-action">
            Vedi documenti
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
        <Link className="metric metric-link" href="/documents?status=valid" aria-label="Vedi documenti validi">
          <span>Validi</span>
          <strong>{counts.valid}</strong>
          <span className="metric-action">
            Vedi documenti
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
        <Link className="metric metric-link pdf-missing" href="/documents?pdf=missing" aria-label="Vedi documenti senza PDF allegato">
          <span>PDF mancanti</span>
          <strong>{counts.missingPdf}</strong>
          <span className="metric-action">
            Vedi documenti
            <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
      </section>

      <section className="detail-section">
        <h2>Scadenze urgenti</h2>
        <DocumentTable documents={urgentDocuments} emptyText="Nessuna scadenza urgente." />
      </section>
    </>
  );
}
