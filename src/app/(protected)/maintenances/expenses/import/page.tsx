import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { InboxFileUpload } from '@/components/InboxFileUpload';
import { ManagedImportForm } from '@/components/ManagedImportForm';
import { PageHeader } from '@/components/PageHeader';

type ExpenseImportPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function ExpenseImportPage({ searchParams }: ExpenseImportPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;

  return (
    <>
      <PageHeader
        title="Importa fatture e DDT"
        description="Carica fatture, DDT o una scansione continua: ogni pagina diventa un documento autonomo, pronto da verificare."
        action={
          <Link className="secondary-button" href="/maintenances/expenses">
            <ArrowLeft size={16} aria-hidden />
            Torna a fatture e DDT
          </Link>
        }
      />

      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <section className="panel">
        <p className="muted" style={{ marginTop: 0 }}>
          Ogni pagina viene separata fisicamente e trattata come documento autonomo; il pulsante «Apri PDF» mostrerà soltanto
          quella manutenzione. Una pagina può contenere più operazioni e ogni riga va destinata al Magazzino oppure alla targa
          su cui il ricambio è già montato. Le targhe manoscritte non vengono indovinate. Niente entra nei costi finché non
          confermi nella pagina di validazione.
        </p>
        <ManagedImportForm
          action="/api/maintenances/expenses/import"
          buttonLabel="Separa e analizza manutenzioni"
          recoveryHref="/maintenances/expenses/review"
          streamProgress
        >
          <InboxFileUpload />
        </ManagedImportForm>
      </section>
    </>
  );
}
