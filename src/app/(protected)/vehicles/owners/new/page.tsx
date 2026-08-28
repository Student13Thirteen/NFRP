import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { createVehicleOwnerAction } from '../actions';

type NewVehicleOwnerPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function NewVehicleOwnerPage({ searchParams }: NewVehicleOwnerPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;

  return (
    <>
      <PageHeader
        title="Nuovo proprietario"
        description="Basta il nome. Si crea anche da solo quando lo scrivi in un rifornimento o in un viaggio con targa non aziendale."
        action={
          <Link className="secondary-button" href="/vehicles/owners">
            <ArrowLeft size={16} aria-hidden />
            Torna ai proprietari
          </Link>
        }
      />
      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 16 }}>{resolvedSearchParams.error}</p> : null}
      <section className="panel">
        <form action={createVehicleOwnerAction} className="form-stack">
          <div className="form-grid">
            <label>
              Nome o ragione sociale
              <input name="name" required maxLength={160} />
            </label>
            <label>
              Partita IVA
              <input name="vatNumber" maxLength={20} />
            </label>
            <label>
              Telefono
              <input name="phone" maxLength={40} />
            </label>
          </div>
          <label>
            Note
            <textarea name="notes" />
          </label>
          <div className="actions-row">
            <button className="primary-button" type="submit">
              <Save size={16} aria-hidden />
              Salva proprietario
            </button>
            <Link className="secondary-button" href="/vehicles/owners">
              Annulla
            </Link>
          </div>
        </form>
      </section>
    </>
  );
}
