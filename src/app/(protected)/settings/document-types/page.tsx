import { requireUser } from '@/lib/auth';
import { EntityType } from '@prisma/client';
import { Plus, Save, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { prisma } from '@/lib/db';
import { getEntityTypeLabel } from '@/lib/documents';
import { getFireExtinguisherRates } from '@/lib/fire-extinguisher-settings';
import {
  createDocumentTypeAction,
  deleteDocumentTypeAction,
  updateDocumentTypeAction,
  updateFireExtinguisherRatesAction
} from './actions';

function amountInputValue(value: number): string {
  return (value / 100).toFixed(2).replace('.', ',');
}

export default async function DocumentTypesPage() {
  await requireUser();
  const [documentTypes, fireExtinguisherRates] = await Promise.all([
    prisma.documentType.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }]
    }),
    getFireExtinguisherRates()
  ]);

  return (
    <>
      <PageHeader title="Tipi documento" description="Categorie documento e preavviso predefinito." />
      <div className="grid">
        <section className="panel">
          <h2>Tariffe revisione estintori</h2>
          <p className="muted">
            Il costo viene calcolato dalle matricole e dai kg letti nel PDF, poi proposto in revisione e
            attribuito alla targa nel Centro costi solo dopo la validazione.
          </p>
          <form action={updateFireExtinguisherRatesAction} className="form-grid">
            {fireExtinguisherRates.map((rate) => (
              <label key={rate.capacityKg}>
                Estintore {rate.capacityKg} kg (€)
                <input
                  name={`fireExtinguisherRate${rate.capacityKg}`}
                  inputMode="decimal"
                  defaultValue={amountInputValue(rate.priceCents)}
                  required
                />
              </label>
            ))}
            <button className="primary-button" type="submit">
              <Save size={16} aria-hidden />
              Salva tariffe
            </button>
          </form>
        </section>
        <section className="panel">
          <h2>Nuovo tipo documento</h2>
          <form action={createDocumentTypeAction} className="form-grid">
            <label>
              Nome
              <input name="name" required />
            </label>
            <label>
              Categoria suggerita
              <select name="suggestedEntityType" defaultValue={EntityType.DRIVER}>
                {Object.values(EntityType).map((entityType) => (
                  <option key={entityType} value={entityType}>
                    {getEntityTypeLabel(entityType)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Giorni preavviso default
              <input name="defaultNoticeDays" type="number" min={1} defaultValue={30} required />
            </label>
            <label className="checkbox-row">
              <input name="active" type="checkbox" defaultChecked />
              Attivo
            </label>
            <button className="primary-button" type="submit">
              <Plus size={16} aria-hidden />
              Salva
            </button>
          </form>
        </section>
        <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Categoria suggerita</th>
                <th>Preavviso</th>
                <th>Stato</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {documentTypes.map((documentType) => (
                <tr key={documentType.id}>
                  <td>
                    <form id={`type-${documentType.id}`} action={updateDocumentTypeAction.bind(null, documentType.id)}>
                      <input name="name" defaultValue={documentType.name} required />
                    </form>
                  </td>
                  <td>
                    <select name="suggestedEntityType" form={`type-${documentType.id}`} defaultValue={documentType.suggestedEntityType}>
                      {Object.values(EntityType).map((entityType) => (
                        <option key={entityType} value={entityType}>
                          {getEntityTypeLabel(entityType)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      name="defaultNoticeDays"
                      type="number"
                      min={1}
                      form={`type-${documentType.id}`}
                      defaultValue={documentType.defaultNoticeDays}
                      required
                    />
                  </td>
                  <td>
                    <label className="checkbox-row">
                      <input name="active" type="checkbox" form={`type-${documentType.id}`} defaultChecked={documentType.active} />
                      Attivo
                    </label>
                  </td>
                  <td>
                    <div className="actions-row">
                      <button className="primary-button" type="submit" form={`type-${documentType.id}`}>
                        <Save size={16} aria-hidden />
                        Salva
                      </button>
                      <form action={deleteDocumentTypeAction.bind(null, documentType.id)}>
                        <button className="danger-button" type="submit">
                          <Trash2 size={16} aria-hidden />
                          Elimina
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
