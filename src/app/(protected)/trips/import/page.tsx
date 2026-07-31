import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { InboxFileUpload } from '@/components/InboxFileUpload';
import { ManagedImportForm } from '@/components/ManagedImportForm';
import { PageHeader } from '@/components/PageHeader';

type TripImportPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function TripImportPage({ searchParams }: TripImportPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;

  return (
    <>
      <PageHeader
        title="Import bolle container"
        description="Carica uno o più PDF: il sistema legge LDV, targa, committente, terminal, container e tappe. L’eventuale nome autista nel PDF resta solo come promemoria e lo inserisci tu."
        action={
          <div className="actions-row">
            <Link className="secondary-button" href="/trips/import/review">
              Da revisionare
            </Link>
            <Link className="secondary-button" href="/trips/container">
              Trasporti container
            </Link>
          </div>
        }
      />

      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <section className="panel">
        <ManagedImportForm action="/api/trips/import" buttonLabel="Importa bolle container">
          <InboxFileUpload />
        </ManagedImportForm>
      </section>
    </>
  );
}
