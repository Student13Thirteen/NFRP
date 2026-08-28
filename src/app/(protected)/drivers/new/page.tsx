import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { createDriverAction } from '../actions';

export default async function NewDriverPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="Nuovo autista"
        description="Inserimento dell'anagrafica. Rapporto di lavoro, mezzi e documenti si completano poi nella scheda."
        action={
          <Link className="secondary-button" href="/drivers">
            <ArrowLeft size={16} aria-hidden />
            Torna agli autisti
          </Link>
        }
      />
      <section className="panel">
        <form action={createDriverAction} className="form-stack">
          <div className="form-grid">
            <label>
              Nome
              <input name="firstName" required />
            </label>
            <label>
              Cognome
              <input name="lastName" required />
            </label>
            <label>
              Telefono
              <input name="phone" />
            </label>
            <label>
              Email
              <input name="email" type="email" />
            </label>
          </div>
          <label>
            Note
            <textarea name="notes" />
          </label>
          <label className="checkbox-row">
            <input name="active" type="checkbox" defaultChecked />
            Disponibile nelle selezioni operative
          </label>
          <div className="actions-row">
            <button className="primary-button" type="submit">
              <Save size={16} aria-hidden />
              Salva autista
            </button>
            <Link className="secondary-button" href="/drivers">
              Annulla
            </Link>
          </div>
        </form>
      </section>
    </>
  );
}
