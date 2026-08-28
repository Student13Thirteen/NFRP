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
        title="Importa bolle container"
        description="Carica PDF o immagini JPG, PNG e WebP: il sistema propone LDV, data, autista, targa, committente, percorso e container. Prima di creare il viaggio controlli i campi; scritte a mano e fotografie non vengono mai considerate definitive."
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
          <InboxFileUpload context="container-trips" />
        </ManagedImportForm>
      </section>
    </>
  );
}
