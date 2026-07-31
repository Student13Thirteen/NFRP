import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowLeft, Ban, Download, ReceiptText, UploadCloud } from 'lucide-react';
import { notFound } from 'next/navigation';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { PageHeader } from '@/components/PageHeader';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import {
  formatBasisPoints,
  formatLeaseMoney,
  getLeaseInstallmentKindLabel,
  getLeaseStatusLabel,
  getLeaseVehicleLabel,
  leaseContractInclude
} from '@/lib/lease';
import { cancelLeaseContractAction } from '../actions';

type LeaseDetailProps = { params: Promise<{ id: string }> };

export default async function LeaseDetailPage({ params }: LeaseDetailProps) {
  await requireUser();
  const { id } = await params;
  const contract = await prisma.leaseContract.findUnique({ where: { id }, include: leaseContractInclude });
  if (!contract) notFound();

  const forecastNet = contract.installments.reduce((sum, item) => sum + item.netAmountCents, 0);
  const forecastGross = contract.installments.reduce((sum, item) => sum + item.grossAmountCents, 0);
  const confirmedInvoices = contract.invoices.filter((invoice) => invoice.status === 'CONFIRMED');
  const actualGross = confirmedInvoices.reduce((sum, invoice) => sum + invoice.totalAmountCents, 0);

  return (
    <>
      <PageHeader
        title={`Leasing ${contract.contractNumber || ''}`.trim()}
        description={`${contract.lessor?.name || contract.lessorName || 'Locatore non indicato'} · ${getLeaseVehicleLabel(contract)}`}
        action={
          <div className="actions-row">
            <Link className="secondary-button" href="/leases"><ArrowLeft size={16} aria-hidden />Torna ai leasing</Link>
            {contract.filePath ? <Link className="secondary-button" href={`/api/leases/${contract.id}/file`} target="_blank"><Download size={16} aria-hidden />Apri contratto</Link> : null}
            <Link className="primary-button" href="/leases/import"><UploadCloud size={16} aria-hidden />Carica fattura/PDF</Link>
          </div>
        }
      />

      <section className="metrics" aria-label="Riepilogo contratto">
        <div className="metric"><span>Stato</span><strong>{getLeaseStatusLabel(contract.status)}</strong></div>
        <div className="metric"><span>Piano netto</span><strong>{formatLeaseMoney(forecastNet)}</strong></div>
        <div className="metric"><span>Piano ivato</span><strong>{formatLeaseMoney(forecastGross)}</strong></div>
        <div className="metric"><span>Fatture confermate</span><strong>{formatLeaseMoney(actualGross)}</strong></div>
      </section>

      <section className="detail-grid" style={{ marginBottom: 18 }}>
        <div className="detail-section">
          <h2>Contratto</h2>
          <dl className="detail-list">
            <div><dt>Numero</dt><dd>{contract.contractNumber || '-'}</dd></div>
            <div><dt>Data</dt><dd>{contract.contractDate ? formatDate(contract.contractDate) : '-'}</dd></div>
            <div><dt>Decorrenza</dt><dd>{contract.startDate ? formatDate(contract.startDate) : '-'}</dd></div>
            <div><dt>Durata</dt><dd>{contract.durationMonths ? `${contract.durationMonths} mesi` : '-'}</dd></div>
            <div><dt>Targa</dt><dd>{getLeaseVehicleLabel(contract)}</dd></div>
            <div><dt>Fornitore veicolo</dt><dd>{contract.vehicleSupplierName || '-'}</dd></div>
          </dl>
        </div>
        <div className="detail-section">
          <h2>Condizioni economiche</h2>
          <dl className="detail-list">
            <div><dt>Primo canone netto</dt><dd>{formatLeaseMoney(contract.advancePaymentNetCents)}</dd></div>
            <div><dt>Canone periodico netto</dt><dd>{formatLeaseMoney(contract.recurringPaymentNetCents)}</dd></div>
            <div><dt>Canoni periodici</dt><dd>{contract.recurringInstallmentCount ?? '-'}</dd></div>
            <div><dt>Riscatto netto</dt><dd>{formatLeaseMoney(contract.buyoutNetCents)}</dd></div>
            <div><dt>TAN</dt><dd>{formatBasisPoints(contract.tanBasisPoints)}</dd></div>
            <div><dt>Tasso leasing</dt><dd>{formatBasisPoints(contract.leaseRateBasisPoints)}</dd></div>
          </dl>
        </div>
      </section>

      <section className="detail-section" style={{ marginBottom: 18 }}>
        <h2>Piano canoni previsionale</h2>
        <p className="muted">Queste righe sono impegni previsti e restano separate dai costi contabili. Il riscatto non è incluso finché non viene esercitato/fatturato.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>N.</th><th>Scadenza</th><th>Tipo</th><th>Netto</th><th>IVA</th><th>Ivato</th></tr></thead>
            <tbody>
              {contract.installments.length === 0 ? (
                <tr><td colSpan={6} className="empty-state">Nessun piano canoni generato.</td></tr>
              ) : contract.installments.map((item) => (
                <tr key={item.id}>
                  <td>{item.position}</td>
                  <td>{formatDate(item.dueDate)}</td>
                  <td>{getLeaseInstallmentKindLabel(item.kind)}</td>
                  <td>{formatLeaseMoney(item.netAmountCents)}</td>
                  <td>{formatLeaseMoney(item.vatCents)}</td>
                  <td><strong>{formatLeaseMoney(item.grossAmountCents)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="detail-section" style={{ marginBottom: 18 }}>
        <h2>Fatture effettive</h2>
        <p className="muted">Le fatture confermate alimentano i costi contabili; quelle in attesa restano escluse.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Data</th><th>Numero</th><th>Importo</th><th>Stato</th><th></th></tr></thead>
            <tbody>
              {contract.invoices.length === 0 ? (
                <tr><td colSpan={5} className="empty-state">Nessuna fattura collegata al contratto.</td></tr>
              ) : contract.invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.documentDate ? formatDate(invoice.documentDate) : formatDate(invoice.registeredAt)}</td>
                  <td>{invoice.documentNumber || '-'}</td>
                  <td>{formatLeaseMoney(invoice.totalAmountCents)}</td>
                  <td>{invoice.status === 'CONFIRMED' ? 'Confermata' : 'Da verificare'}</td>
                  <td><Link className="table-cell-link" href={invoice.status === 'PENDING' ? '/maintenances/expenses/review' : `/maintenances/expenses/${invoice.id}`}><ReceiptText size={14} aria-hidden />Apri</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {contract.status === 'ACTIVE' ? (
        <section className="danger-zone">
          <h2>Annulla contratto</h2>
          <p>Conserva PDF, piano e fatture nello storico, ma rimuove i canoni dagli impegni del centro costi.</p>
          <form action={cancelLeaseContractAction.bind(null, contract.id)}>
            <ConfirmSubmitButton className="danger-button" message="Annullare il contratto leasing? I canoni previsti non compariranno più nel centro costi.">
              <Ban size={16} aria-hidden />Annulla contratto
            </ConfirmSubmitButton>
          </form>
        </section>
      ) : null}
    </>
  );
}
