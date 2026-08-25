import { requireUser } from '@/lib/auth';
import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { ArrowLeft, FileUp, Save, Settings2 } from 'lucide-react';
import { DatePartsInput } from '@/components/DatePartsInput';
import { ExpenseLinesEditor } from '@/components/ExpenseLinesEditor';
import { FileUpload } from '@/components/FileUpload';
import { PageHeader } from '@/components/PageHeader';
import { QuickSupplierField } from '@/components/QuickSupplierField';
import { RecoverableForm } from '@/components/RecoverableForm';
import { toDateInputValue } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { buildAllocationOptions } from '@/lib/expense';
import { buildMaintenanceCategoryOptions } from '@/lib/maintenance';
import { createExpenseDocumentAction } from '../expenses/actions';

type NewMaintenancePageProps = {
  searchParams: Promise<{ error?: string; roadAccidentId?: string }>;
};

export default async function NewMaintenancePage({ searchParams }: NewMaintenancePageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const today = toDateInputValue(new Date());
  const [categories, suppliers, tractors, trailers, drivers, driverAssignments, roadAccidents] = await Promise.all([
    prisma.category.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.supplier.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.tractor.findMany({ where: { active: true }, orderBy: { plate: 'asc' } }),
    prisma.trailer.findMany({ where: { active: true }, orderBy: { plate: 'asc' } }),
    prisma.driver.findMany({ orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }),
    prisma.tractorDriverAssignment.findMany({
      include: { driver: { select: { firstName: true, lastName: true } } },
      orderBy: { validFrom: 'desc' }
    }),
    prisma.roadAccident.findMany({
      where: { status: { not: 'CANCELLED' } },
      orderBy: [{ accidentDate: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        accidentDate: true,
        claimNumber: true,
        location: true,
        tractor: { select: { plate: true } },
        trailer: { select: { plate: true } }
      }
    })
  ]);

  const allocations = buildAllocationOptions(tractors, trailers);
  const categoryChoices = buildMaintenanceCategoryOptions(categories);
  const missingRegistry = categories.length === 0;
  const selectedRoadAccidentId = roadAccidents.some((item) => item.id === resolvedSearchParams.roadAccidentId)
    ? resolvedSearchParams.roadAccidentId
    : '';

  return (
    <>
      <PageHeader
        title="Inserisci nuova manutenzione"
        description="Una riga per un intervento semplice, una riga per ogni voce se hai una fattura o un DDT. Prezzi con il punto, IVA e destinazione per riga."
        action={
          <div className="actions-row">
            <Link className="secondary-button" href="/maintenances">
              <ArrowLeft size={16} aria-hidden />
              Torna alle manutenzioni
            </Link>
            <Link className="secondary-button" href="/maintenances/expenses/import">
              <FileUp size={16} aria-hidden />
              Importa manutenzioni da PDF
            </Link>
            <Link className="secondary-button" href="/maintenances/settings">
              <Settings2 size={16} aria-hidden />
              Categorie e fornitori
            </Link>
          </div>
        }
      />

      <section className="panel">
        {resolvedSearchParams.error ? <p className="form-error">{resolvedSearchParams.error}</p> : null}
        {missingRegistry ? (
          <p className="form-error">Inserisci almeno una categoria manutenzione prima di registrare un intervento.</p>
        ) : null}

        <RecoverableForm
          action={createExpenseDocumentAction}
          className="form-stack"
          recoveryKey="maintenance:new"
          recoverOnError={Boolean(resolvedSearchParams.error)}
        >
          <input name="submissionKey" type="hidden" defaultValue={randomUUID()} />
          <div className="form-section-title">Manutenzione</div>
          <div className="form-grid">
            <DatePartsInput label="Data registrazione" name="registeredAt" defaultValue={today} required />
            <DatePartsInput label="Data documento" name="documentDate" />
            <QuickSupplierField
              options={suppliers.map((supplier) => ({ id: supplier.id, label: supplier.name, active: supplier.active }))}
            />
            <label>
              Numero documento
              <input name="documentNumber" placeholder="Fattura, DDT o riferimento interno" />
            </label>
            <label>
              Sinistro collegato (opzionale)
              <select name="roadAccidentId" defaultValue={selectedRoadAccidentId}>
                <option value="">Nessun sinistro</option>
                {roadAccidents.map((accident) => {
                  const vehicle = accident.tractor?.plate || accident.trailer?.plate;
                  return (
                    <option key={accident.id} value={accident.id}>
                      {[toDateInputValue(accident.accidentDate), vehicle, accident.claimNumber || accident.location].filter(Boolean).join(' · ')}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>

          <div className="form-section-title">Lavori e ricambi</div>
          <p className="muted" style={{ margin: '0 0 10px' }}>
            Per una manutenzione semplice compila la sola prima riga. Aggiungi altre righe se la fattura o il DDT ne contiene più di una.
          </p>
          <ExpenseLinesEditor
            allocations={allocations}
            categories={categoryChoices}
            allocationDate={today}
            drivers={drivers.map((driver) => ({
              id: driver.id,
              label: `${driver.lastName} ${driver.firstName}`.trim(),
              active: driver.active
            }))}
            driverAssignments={driverAssignments.map((assignment) => ({
              tractorId: assignment.tractorId,
              driverId: assignment.driverId,
              validFrom: toDateInputValue(assignment.validFrom),
              validTo: assignment.validTo ? toDateInputValue(assignment.validTo) : null,
              driver: assignment.driver
            }))}
            trailerTractorLinks={trailers.map((trailer) => ({
              trailerId: trailer.id,
              tractorId: trailer.assignedTractorId
            }))}
          />

          <label>
            Note interne
            <textarea name="notes" rows={2} />
          </label>

          <div className="form-grid">
            <FileUpload label="PDF della manutenzione (opzionale)" name="file" />
            <label className="checkbox-row" style={{ alignSelf: 'end' }}>
              <input name="saveAsPending" type="checkbox" />
              Lascia da controllare prima di registrarla nei costi
            </label>
          </div>

          <button className="primary-button" type="submit" disabled={missingRegistry}>
            <Save size={16} aria-hidden />
            Salva manutenzione
          </button>
        </RecoverableForm>
      </section>
    </>
  );
}
