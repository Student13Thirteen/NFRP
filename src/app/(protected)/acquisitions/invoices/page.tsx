import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowLeft, FileCheck2, Fuel, ReceiptText, ScanLine } from 'lucide-react';
import { InboxFileUpload } from '@/components/InboxFileUpload';
import { ManagedImportForm } from '@/components/ManagedImportForm';
import { PageHeader } from '@/components/PageHeader';

type SmartInvoiceImportPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function SmartInvoiceImportPage({ searchParams }: SmartInvoiceImportPageProps) {
  await requireUser();
  const { error } = await searchParams;

  return (
    <>
      <PageHeader
        title="Importa fatture e manutenzioni"
        description="Un unico caricamento per fatture WinSoftware, DDT ricambi e scansioni massive di manutenzioni."
        action={
          <Link className="secondary-button" href="/acquisitions">
            <ArrowLeft size={16} aria-hidden />
            Acquisizioni
          </Link>
        }
      />

      {error ? <p className="form-error" style={{ marginBottom: 18 }}>{error}</p> : null}

      <section className="workflow-steps" aria-label="Flusso fatture automatiche">
        <div><ScanLine size={17} aria-hidden /><span>1</span><strong>Legge ogni pagina</strong></div>
        <div><Fuel size={17} aria-hidden /><span>2</span><strong>Riconosce rifornimenti</strong></div>
        <div><ReceiptText size={17} aria-hidden /><span>3</span><strong>Riconosce manutenzioni</strong></div>
        <div><FileCheck2 size={17} aria-hidden /><span>4</span><strong>Prepara il controllo</strong></div>
      </section>

      <section className="panel">
        <p className="muted" style={{ marginTop: 0 }}>
          I rifornimenti WinSoftware vengono separati dalle manutenzioni. Per DDT e scansioni di manutenzione ogni pagina
          riconosciuta diventa una bozza autonoma. Targa, autista indicato a penna e destinazione Magazzino non vengono
          dedotti: scegli tu la destinazione nella revisione prima di validare.
        </p>
        <ManagedImportForm
          action="/api/invoices/import"
          buttonLabel="Analizza e classifica fatture"
          recoveryHref="/acquisitions"
          streamProgress
        >
          <InboxFileUpload />
        </ManagedImportForm>
      </section>
    </>
  );
}
