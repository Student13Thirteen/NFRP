import { requireUser } from '@/lib/auth';
import { VehicleLifecycleStatus } from '@prisma/client';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { prisma } from '@/lib/db';
import {
  TANK_CARGO_TYPES,
  TRAILER_BODY_TYPES,
  getTankCargoLabel,
  getTrailerBodyTypeLabel
} from '@/lib/vehicle-types';
import { createTrailerAction } from '../actions';

export default async function NewTrailerPage() {
  await requireUser();
  const tractors = await prisma.tractor.findMany({
    where: { lifecycleStatus: VehicleLifecycleStatus.ACTIVE },
    orderBy: { plate: 'asc' }
  });

  return (
    <>
      <PageHeader
        title="Nuovo semirimorchio"
        description="Targa, allestimento e mezzo a motore abbinato. L'autista deriva sempre dal mezzo abbinato."
        action={
          <Link className="secondary-button" href="/vehicles/trailers">
            <ArrowLeft size={16} aria-hidden />
            Torna ai semirimorchi
          </Link>
        }
      />
      <section className="panel">
        <form action={createTrailerAction} className="form-stack">
          <div className="form-grid">
            <label>
              Targa
              <input name="plate" required />
            </label>
            <label>
              Allestimento
              <select name="bodyType" defaultValue="">
                <option value="">Da classificare</option>
                {TRAILER_BODY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {getTrailerBodyTypeLabel(type)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Carico cisterna
              <select name="tankCargo" defaultValue="">
                <option value="">Solo per le cisterne</option>
                {TANK_CARGO_TYPES.map((cargo) => (
                  <option key={cargo} value={cargo}>
                    {getTankCargoLabel(cargo)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Marca
              <input name="brand" />
            </label>
            <label>
              Modello
              <input name="model" />
            </label>
            <label>
              Trattore associato
              <select name="assignedTractorId" defaultValue="">
                <option value="">Nessuno</option>
                {tractors.map((tractor) => (
                  <option key={tractor.id} value={tractor.id}>
                    {tractor.plate}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Note
            <textarea name="notes" />
          </label>
          <div className="actions-row">
            <button className="primary-button" type="submit">
              <Save size={16} aria-hidden />
              Salva semirimorchio
            </button>
            <Link className="secondary-button" href="/vehicles/trailers">
              Annulla
            </Link>
          </div>
        </form>
      </section>
    </>
  );
}
