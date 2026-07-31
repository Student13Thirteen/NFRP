import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { InboxFileUpload } from '@/components/InboxFileUpload';
import { ManagedImportForm } from '@/components/ManagedImportForm';
import { PageHeader } from '@/components/PageHeader';

type FuelImportPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function FuelImportPage({ searchParams }: FuelImportPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;

  return (
    <>
      <PageHeader
        title="Import rifornimenti PDF"
        description="Carica tabulati FuelCo: il sistema legge le righe, crea le tessere e registra i rifornimenti per targa."
        action={
          <Link className="secondary-button" href="/fuel">
            Rifornimenti
          </Link>
        }
      />

      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 18 }}>{resolvedSearchParams.error}</p> : null}

      <section className="panel">
        <ManagedImportForm action="/api/fuel/import" buttonLabel="Importa rifornimenti">
          <InboxFileUpload />
        </ManagedImportForm>
      </section>
    </>
  );
}
