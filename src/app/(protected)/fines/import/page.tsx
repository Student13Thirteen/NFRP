import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowLeft, BadgeAlert } from 'lucide-react';
import { InboxFileUpload } from '@/components/InboxFileUpload';
import { ManagedImportForm } from '@/components/ManagedImportForm';
import { PageHeader } from '@/components/PageHeader';

type Props = { searchParams: Promise<{ error?: string }> };

export default async function RoadFineImportPage({ searchParams }: Props) {
  await requireUser();
  const params = await searchParams;
  return (
    <>
      <PageHeader
        title="Acquisisci verbali da PDF"
        description="Carica uno o più verbali: il gestionale legge testo o OCR, propone i campi riconoscibili e conserva ogni fascicolo come bozza da controllare."
        action={<Link className="secondary-button" href="/fines"><ArrowLeft size={16} aria-hidden />Torna ai verbali</Link>}
      />
      {params.error ? <p className="form-error" style={{ marginBottom: 18 }}>{params.error}</p> : null}
      <section className="panel">
        <div className="info-banner" style={{ marginBottom: 18 }}>
          <BadgeAlert size={18} aria-hidden />
          <span>
            Ogni PDF resta un unico verbale con avvisi e pagoPA allegati. Autista, responsabilità, pagamento e scadenze non certe restano vuoti:
            nessuna bozza entra nel centro costi finché non registri un pagamento effettivo.
          </span>
        </div>
        <ManagedImportForm
          action="/api/fines/import"
          buttonLabel="Leggi e prepara i verbali"
          recoveryHref="/fines?status=TO_REVIEW"
          streamProgress
        >
          <InboxFileUpload context="road-fines" />
        </ManagedImportForm>
      </section>
    </>
  );
}
