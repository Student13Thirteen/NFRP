import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { createOtherEntityAction } from '../actions';

export default async function NewOtherEntityPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="Nuova entità"
        description="Porti, aziende, permessi speciali e altri riferimenti a cui collegare documenti e scadenze."
        action={
          <Link className="secondary-button" href="/others">
            <ArrowLeft size={16} aria-hidden />
            Torna alle altre entità
          </Link>
        }
      />
      <section className="panel">
        <form action={createOtherEntityAction} className="form-stack">
          <div className="form-grid">
            <label>
              Nome
              <input name="name" required />
            </label>
            <label>
              Categoria
              <input name="category" placeholder="Porto, Azienda, Cliente..." required />
            </label>
          </div>
          <label>
            Note
            <textarea name="notes" />
          </label>
          <label className="checkbox-row">
            <input name="active" type="checkbox" defaultChecked />
            Attivo
          </label>
          <div className="actions-row">
            <button className="primary-button" type="submit">
              <Save size={16} aria-hidden />
              Salva entità
            </button>
            <Link className="secondary-button" href="/others">
              Annulla
            </Link>
          </div>
        </form>
      </section>
    </>
  );
}
