import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { CsvFileUpload } from '@/components/CsvFileUpload';
import { ManagedImportForm } from '@/components/ManagedImportForm';
import { PageHeader } from '@/components/PageHeader';

type TollImportPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function TollImportPage({ searchParams }: TollImportPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;

  return (
    <>
      <PageHeader
        title="Import autostrade CSV"
        description="Carica il CSV originale: il sistema legge pedaggi, tratte, importi IVA, targhe e tessere senza passaggi da Excel."
        action={
          <Link className="secondary-button" href="/tolls">
            Autostrade
          </Link>
        }
      />

      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <section className="panel" style={{ marginBottom: 18 }}>
        <p>
          Sono supportati sia il CSV con separatore punto e virgola/virgola decimale sia quello con separatore virgola/punto
          decimale. Le colonne utili vengono lette dal file originale e le tessere vengono associate automaticamente alla
          targa quando il rapporto e univoco.
        </p>
      </section>

      <section className="panel">
        <ManagedImportForm action="/api/tolls/import" buttonLabel="Importa autostrade">
          <CsvFileUpload />
        </ManagedImportForm>
      </section>
    </>
  );
}
