import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { CustomerFormFields } from '@/components/CustomerFormFields';
import { PageHeader } from '@/components/PageHeader';
import { createCustomerAction } from '../actions';

type NewCustomerPageProps = { searchParams: Promise<{ error?: string }> };

export default async function NewCustomerPage({ searchParams }: NewCustomerPageProps) {
  await requireUser();
  const params = await searchParams;

  return (
    <>
      <PageHeader
        title="Nuovo cliente"
        description="La ragione sociale e obbligatoria; i dati fiscali possono essere completati progressivamente."
        action={
          <Link className="secondary-button" href="/customers">
            <ArrowLeft size={16} aria-hidden />
            Torna ai clienti
          </Link>
        }
      />
      {params.error ? <p className="form-error" style={{ marginBottom: 18 }}>{params.error}</p> : null}
      <section className="panel">
        <form action={createCustomerAction} className="form-stack">
          <CustomerFormFields />
          <div className="actions-row">
            <button className="primary-button" type="submit">
              <Save size={16} aria-hidden />
              Salva cliente
            </button>
            <Link className="secondary-button" href="/customers">
              Annulla
            </Link>
          </div>
        </form>
      </section>
    </>
  );
}
