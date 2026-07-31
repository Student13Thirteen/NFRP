import { requireUser } from '@/lib/auth';
import { ContainerTripExtraKind } from '@prisma/client';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import {
  formatContainerMoney,
  getContainerTripExtraKindLabel
} from '@/lib/container-trips';
import { prisma } from '@/lib/db';
import { createContainerTariffAction } from '../actions';

type Props = { searchParams: Promise<{ error?: string }> };

export default async function ContainerTariffsPage({ searchParams }: Props) {
  await requireUser();
  const params = await searchParams;
  const tariffs = await prisma.containerExtraTariff.findMany({
    orderBy: [{ active: 'desc' }, { kind: 'asc' }, { name: 'asc' }]
  });

  return (
    <>
      <PageHeader
        title="Prezzario extra container"
        description="Le tariffe sono proposte iniziali, non valori imposti: ogni viaggio conserva proposta, negoziazione, approvazione e motivo."
        action={<Link className="secondary-button" href="/trips/container">Trasporti container</Link>}
      />
      {params.error ? <p className="form-error" style={{ marginBottom: 18 }}>{params.error}</p> : null}

      <div className="grid two">
        <section className="panel">
          <h2>Nuova voce standard</h2>
          <form action={createContainerTariffAction} className="form-stack">
            <label>
              Nome
              <input name="name" required placeholder="Es. Dogana ordinaria" />
            </label>
            <div className="form-grid">
              <label>
                Tipo
                <select name="kind" defaultValue={ContainerTripExtraKind.CUSTOMS}>
                  {Object.values(ContainerTripExtraKind).map((kind) => (
                    <option value={kind} key={kind}>{getContainerTripExtraKindLabel(kind)}</option>
                  ))}
                </select>
              </label>
              <label>
                Prezzo standard
                <input name="defaultUnitPrice" inputMode="decimal" required placeholder="Es. 120,00" />
              </label>
              <label>
                Unita
                <input name="unitLabel" defaultValue="evento" placeholder="evento, ora, km" />
              </label>
            </div>
            <label>
              Direttive / note
              <textarea name="notes" rows={3} placeholder="Quando proporla e quali eccezioni considerare" />
            </label>
            <button className="primary-button" type="submit"><Plus size={15} aria-hidden />Aggiungi tariffa</button>
          </form>
        </section>

        <section className="table-wrap">
          <table>
            <thead><tr><th>Voce</th><th>Tipo</th><th>Standard</th><th>Note</th></tr></thead>
            <tbody>
              {tariffs.length === 0 ? (
                <tr><td colSpan={4} className="empty-state">Prezzario ancora vuoto.</td></tr>
              ) : tariffs.map((tariff) => (
                <tr key={tariff.id}>
                  <td><strong>{tariff.name}</strong>{!tariff.active ? <div className="muted">Non attiva</div> : null}</td>
                  <td>{getContainerTripExtraKindLabel(tariff.kind)}</td>
                  <td>{formatContainerMoney(tariff.defaultUnitPriceCents)} / {tariff.unitLabel}</td>
                  <td>{tariff.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
