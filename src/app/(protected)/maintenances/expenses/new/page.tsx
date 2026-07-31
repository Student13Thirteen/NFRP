import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowLeft, ClipboardList, Save } from 'lucide-react';
import { DatePartsInput } from '@/components/DatePartsInput';
import { ExpenseLinesEditor } from '@/components/ExpenseLinesEditor';
import { FileUpload } from '@/components/FileUpload';
import { PageHeader } from '@/components/PageHeader';
import { toDateInputValue } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { buildAllocationOptions } from '@/lib/expense';
import { buildMaintenanceCategoryOptions } from '@/lib/maintenance';
import { createExpenseDocumentAction } from '../actions';

type NewExpensePageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function NewExpenseDocumentPage({ searchParams }: NewExpensePageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const [categories, suppliers, tractors, trailers] = await Promise.all([
    prisma.category.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.supplier.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.tractor.findMany({ where: { active: true }, orderBy: { plate: 'asc' } }),
    prisma.trailer.findMany({ where: { active: true }, orderBy: { plate: 'asc' } })
  ]);

  const allocations = buildAllocationOptions(tractors, trailers);
  const categoryChoices = buildMaintenanceCategoryOptions(categories);

  return (
    <>
      <PageHeader
        title="Nuova fattura/DDT multi-riga"
        description="Inserimento manuale con prezzo netto, IVA, prezzo ivato e destinazione per ogni riga."
        action={
          <div className="actions-row">
            <Link className="secondary-button" href="/maintenances/expenses">
              <ArrowLeft size={16} aria-hidden />
              Torna a fatture e DDT
            </Link>
            <Link className="secondary-button" href="/maintenances/new">
              <ClipboardList size={16} aria-hidden />
              Scheda semplice
            </Link>
          </div>
        }
      />

      <section className="panel">
        {resolvedSearchParams.error ? <p className="form-error">{resolvedSearchParams.error}</p> : null}

        <form action={createExpenseDocumentAction} className="form-stack">
          <div className="form-section-title">Documento</div>
          <div className="form-grid">
            <DatePartsInput label="Data registrazione" name="registeredAt" defaultValue={toDateInputValue(new Date())} required />
            <DatePartsInput label="Data documento" name="documentDate" />
            <label>
              Fornitore / officina
              <select name="supplierId" defaultValue="">
                <option value="">Non indicato</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Numero documento
              <input name="documentNumber" placeholder="Fattura, DDT o scheda" />
            </label>
          </div>

          <div className="form-section-title">Righe fattura/DDT</div>
          <ExpenseLinesEditor allocations={allocations} categories={categoryChoices} />

          <label>
            Note interne
            <textarea name="notes" rows={2} />
          </label>

          <div className="form-grid">
            <FileUpload label="PDF del documento (opzionale)" name="file" />
            <label className="checkbox-row" style={{ alignSelf: 'end' }}>
              <input name="saveAsPending" type="checkbox" />
              Lascia in bozza da validare
            </label>
          </div>

          <button className="primary-button" type="submit">
            <Save size={16} aria-hidden />
            Salva fattura / DDT
          </button>
        </form>
      </section>
    </>
  );
}
