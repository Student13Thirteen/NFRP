import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowLeft, ReceiptText } from 'lucide-react';
import { InboxFileUpload } from '@/components/InboxFileUpload';
import { ManagedImportForm } from '@/components/ManagedImportForm';
import { PageHeader } from '@/components/PageHeader';

type LeaseImportPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LeaseImportPage({ searchParams }: LeaseImportPageProps) {
  await requireUser();
  const params = await searchParams;
  return (
    <>
      <PageHeader
        title="Importa leasing da PDF"
        description="Carica contratti o fatture di leasing: testo PDF e OCR compilano una bozza da verificare prima di aggiornare costi e previsioni."
        action={
          <Link className="secondary-button" href="/leases">
            <ArrowLeft size={16} aria-hidden />
            Torna ai leasing
          </Link>
        }
      />

      {params.error ? <p className="form-error" style={{ marginBottom: 18 }}>{params.error}</p> : null}

      <section className="panel">
        <div className="info-banner" style={{ marginBottom: 18 }}>
          <ReceiptText size={18} aria-hidden />
          <span>
            I contratti generano un piano previsionale solo dopo targa e decorrenza confermate. Le fatture diventano costi
            contabili solo dopo la validazione: il PDF non registra mai importi in automatico senza controllo umano.
          </span>
        </div>
        <ManagedImportForm action="/api/leases/import" buttonLabel="Analizza contratti e fatture">
          <InboxFileUpload />
        </ManagedImportForm>
      </section>
    </>
  );
}
