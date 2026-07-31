import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  FileInput,
  FileText,
  Fuel,
  Landmark,
  MapPinned,
  Plus,
  ReceiptText,
  Route,
  ScanLine,
  ShieldCheck,
  UploadCloud,
  Wrench
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { prisma } from '@/lib/db';

type AcquisitionEvent = {
  createdAt: Date;
  detail: string;
  href: string;
  label: string;
  pending: number;
  source: string;
};

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Rome'
  }).format(date);
}

export default async function AcquisitionsPage() {
  await requireUser();
  const [
    documentPending,
    tripPending,
    fuelPending,
    tollPending,
    expensePending,
    leaseContractPending,
    leaseInvoicePending,
    documentEvents,
    tripBatches,
    fuelBatches,
    tollBatches,
    expenseEvents,
    leaseContractEvents,
    leaseInvoiceEvents
  ] = await Promise.all([
    prisma.documentInboxItem.count({ where: { status: 'PENDING' } }),
    prisma.tripImportRow.count({ where: { status: 'PENDING' } }),
    prisma.fuelEntry.count({ where: { status: 'PENDING' } }),
    prisma.tollEntry.count({ where: { status: 'PENDING' } }),
    prisma.expenseDocument.count({ where: { status: 'PENDING', source: { not: 'LEASE_INVOICE_IMPORT' } } }),
    prisma.leaseContract.count({ where: { status: 'PENDING' } }),
    prisma.expenseDocument.count({ where: { status: 'PENDING', source: 'LEASE_INVOICE_IMPORT' } }),
    prisma.documentInboxItem.findMany({ orderBy: { createdAt: 'desc' }, take: 6 }),
    prisma.tripImportBatch.findMany({
      include: { _count: { select: { rows: { where: { status: 'PENDING' } } } } },
      orderBy: { createdAt: 'desc' },
      take: 6
    }),
    prisma.fuelImportBatch.findMany({
      include: { _count: { select: { entries: { where: { status: 'PENDING' } } } } },
      orderBy: { createdAt: 'desc' },
      take: 6
    }),
    prisma.tollImportBatch.findMany({
      include: { _count: { select: { entries: { where: { status: 'PENDING' } } } } },
      orderBy: { createdAt: 'desc' },
      take: 6
    }),
    prisma.expenseDocument.findMany({
      where: { source: { in: ['IMPORT', 'MAINTENANCE_IMPORT'] } },
      orderBy: { createdAt: 'desc' },
      take: 6
    }),
    prisma.leaseContract.findMany({
      orderBy: { createdAt: 'desc' },
      take: 6
    }),
    prisma.expenseDocument.findMany({
      where: { source: 'LEASE_INVOICE_IMPORT' },
      orderBy: { createdAt: 'desc' },
      take: 6
    })
  ]);

  const leasePending = leaseContractPending + leaseInvoicePending;
  const totalPending = documentPending + tripPending + fuelPending + tollPending + expensePending + leasePending;
  const cards = [
    {
      title: 'Documenti flotta',
      detail: 'Polizze, libretti, revisioni e scadenze',
      format: 'PDF',
      icon: FileText,
      importHref: '/documents/inbox',
      reviewHref: '/documents/inbox',
      pending: documentPending,
      tone: 'blue'
    },
    {
      title: 'Bolle container',
      detail: 'Lettere di vettura container, committenti e tappe',
      format: 'PDF',
      icon: MapPinned,
      importHref: '/trips/import',
      reviewHref: '/trips/import/review',
      pending: tripPending,
      tone: 'teal'
    },
    {
      title: 'Rifornimenti',
      detail: 'Tabulati carburante FuelCo',
      format: 'PDF',
      icon: Fuel,
      importHref: '/fuel/import',
      reviewHref: '/fuel/import/review',
      pending: fuelPending,
      tone: 'amber'
    },
    {
      title: 'Pedaggi',
      detail: 'Rendiconti Autostrade e FAI',
      format: 'CSV',
      icon: Route,
      importHref: '/tolls/import',
      reviewHref: '/tolls/import/review',
      pending: tollPending,
      tone: 'violet'
    },
    {
      title: 'Leasing',
      detail: 'Contratti, piani canoni e fatture di società diverse',
      format: 'PDF',
      icon: Landmark,
      importHref: '/leases/import',
      reviewHref: leaseContractPending > 0 ? '/leases/import/review' : '/maintenances/expenses/review',
      pending: leasePending,
      tone: 'teal'
    },
    {
      title: 'Manutenzioni e ricambi',
      detail: 'Fatture officina, DDT ricambi e scansioni massive',
      format: 'PDF',
      icon: Wrench,
      importHref: '/maintenances/expenses/import',
      reviewHref: '/maintenances/expenses/review',
      pending: expensePending,
      tone: 'red'
    },
    {
      title: 'Fatture WinSoftware',
      detail: 'Classificazione automatica tra rifornimenti e manutenzioni',
      format: 'PDF',
      icon: ReceiptText,
      importHref: '/acquisitions/invoices',
      reviewHref: '/acquisitions',
      pending: null,
      tone: 'violet'
    }
  ];

  const events: AcquisitionEvent[] = [
    ...documentEvents.map((item) => ({
      createdAt: item.createdAt,
      detail: item.originalFileName,
      href: item.status === 'PENDING' ? `/documents/inbox/${item.id}` : '/documents/inbox',
      label: item.status === 'PENDING' ? 'Da controllare' : item.status === 'IMPORTED' ? 'Acquisito' : 'Scartato',
      pending: item.status === 'PENDING' ? 1 : 0,
      source: 'Documento flotta'
    })),
    ...tripBatches.map((batch) => ({
      createdAt: batch.createdAt,
      detail: `${batch.originalFileName} · ${batch.parsedRows} righe`,
      href: '/trips/import/review',
      label: batch._count.rows > 0 ? 'Da controllare' : 'Completato',
      pending: batch._count.rows,
      source: 'Bolle container'
    })),
    ...fuelBatches.map((batch) => ({
      createdAt: batch.createdAt,
      detail: `${batch.originalFileName} · ${batch.importedRows} righe`,
      href: '/fuel/import/review',
      label: batch._count.entries > 0 ? 'Da controllare' : 'Completato',
      pending: batch._count.entries,
      source: 'Rifornimenti'
    })),
    ...tollBatches.map((batch) => ({
      createdAt: batch.createdAt,
      detail: `${batch.originalFileName} · ${batch.importedRows} righe`,
      href: '/tolls/import/review',
      label: batch._count.entries > 0 ? 'Da controllare' : 'Completato',
      pending: batch._count.entries,
      source: 'Pedaggi'
    })),
    ...expenseEvents.map((document) => ({
      createdAt: document.createdAt,
      detail: document.originalFileName || document.documentNumber || 'Documento importato',
      href: document.status === 'PENDING' ? '/maintenances/expenses/review' : `/maintenances/expenses/${document.id}`,
      label: document.status === 'PENDING' ? 'Da controllare' : 'Confermato',
      pending: document.status === 'PENDING' ? 1 : 0,
      source: document.source === 'MAINTENANCE_IMPORT' ? 'Manutenzione OCR' : 'Fatture e DDT'
    })),
    ...leaseContractEvents.map((contract) => ({
      createdAt: contract.createdAt,
      detail: contract.originalFileName || contract.contractNumber || 'Contratto leasing',
      href: contract.status === 'PENDING' ? '/leases/import/review' : `/leases/${contract.id}`,
      label: contract.status === 'PENDING' ? 'Da controllare' : 'Acquisito',
      pending: contract.status === 'PENDING' ? 1 : 0,
      source: 'Contratto leasing'
    })),
    ...leaseInvoiceEvents.map((document) => ({
      createdAt: document.createdAt,
      detail: document.originalFileName || document.documentNumber || 'Fattura leasing',
      href: document.status === 'PENDING' ? '/maintenances/expenses/review' : `/maintenances/expenses/${document.id}`,
      label: document.status === 'PENDING' ? 'Da controllare' : 'Confermata',
      pending: document.status === 'PENDING' ? 1 : 0,
      source: 'Fattura leasing'
    }))
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 10);

  return (
    <>
      <PageHeader
        title="Acquisizioni"
        description="Un solo punto di ingresso per documenti, fatture e dati operativi."
        action={
          <Link className="secondary-button" href="/maintenances/expenses/new">
            <Plus size={16} aria-hidden />
            Inserimento manuale
          </Link>
        }
      />

      <section className={`workflow-status ${totalPending > 0 ? 'needs-action' : 'is-clear'}`}>
        <div className="workflow-status-icon">
          {totalPending > 0 ? <ScanLine size={24} aria-hidden /> : <CheckCircle2 size={24} aria-hidden />}
        </div>
        <div>
          <span>Stato acquisizioni</span>
          <strong>{totalPending > 0 ? `${totalPending} elementi richiedono controllo` : 'Tutte le acquisizioni sono allineate'}</strong>
        </div>
        {totalPending > 0 ? <span className="workflow-status-note">I dati entrano nei registri solo dopo la conferma.</span> : null}
      </section>

      <div className="workflow-steps" aria-label="Flusso acquisizione">
        <div><UploadCloud size={17} aria-hidden /><span>1</span><strong>Carica</strong></div>
        <div><ScanLine size={17} aria-hidden /><span>2</span><strong>Lettura</strong></div>
        <div><FileCheck2 size={17} aria-hidden /><span>3</span><strong>Controllo</strong></div>
        <div><ShieldCheck size={17} aria-hidden /><span>4</span><strong>Conferma</strong></div>
      </div>

      <section className="acquisition-grid" aria-label="Tipi di acquisizione">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article className={`acquisition-card tone-${card.tone}`} key={card.title}>
              <div className="acquisition-card-head">
                <span className="acquisition-icon"><Icon size={21} aria-hidden /></span>
                <span className="format-pill">{card.format}</span>
                {card.pending === null
                  ? null
                  : card.pending > 0
                    ? <span className="pending-pill">{card.pending} in attesa</span>
                    : <span className="ready-pill">Allineato</span>}
              </div>
              <div className="acquisition-card-copy">
                <h2>{card.title}</h2>
                <p>{card.detail}</p>
              </div>
              <div className="acquisition-card-actions">
                <Link className="primary-button" href={card.importHref}>
                  <FileInput size={16} aria-hidden />
                  Carica {card.format}
                </Link>
                {card.pending !== null && card.pending > 0 ? (
                  <Link className="secondary-button" href={card.reviewHref}>
                    Controlla
                    <ArrowRight size={15} aria-hidden />
                  </Link>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>

      <section className="detail-section acquisition-history">
        <div className="section-heading-row">
          <div>
            <span className="section-kicker">Attivita</span>
            <h2>Ultime acquisizioni</h2>
          </div>
        </div>
        {events.length === 0 ? (
          <div className="empty-state">Nessuna acquisizione registrata.</div>
        ) : (
          <div className="activity-list">
            {events.map((event, index) => (
              <Link href={event.href} className="activity-row" key={`${event.source}-${event.createdAt.toISOString()}-${index}`} prefetch={false}>
                <span className={`activity-marker${event.pending > 0 ? ' pending' : ''}`} aria-hidden />
                <span className="activity-source">{event.source}</span>
                <span className="activity-detail">{event.detail}</span>
                <span className={`activity-state${event.pending > 0 ? ' pending' : ''}`}>{event.pending > 1 ? `${event.pending} da controllare` : event.label}</span>
                <time>{formatDateTime(event.createdAt)}</time>
                <ArrowRight size={15} aria-hidden />
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
