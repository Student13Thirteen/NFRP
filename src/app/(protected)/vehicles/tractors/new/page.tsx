import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { DatePartsInput } from '@/components/DatePartsInput';
import { PageHeader } from '@/components/PageHeader';
import { startOfDay, toDateInputValue } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { MOTOR_VEHICLE_TYPES, getMotorVehicleTypeLabel } from '@/lib/vehicle-types';
import { createTractorAction } from '../actions';

type NewTractorPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function NewTractorPage({ searchParams }: NewTractorPageProps) {
  await requireUser();
  const resolvedSearchParams = await searchParams;
  const today = startOfDay(new Date());
  const drivers = await prisma.driver.findMany({
    where: { active: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
  });

  return (
    <>
      <PageHeader
        title="Nuovo mezzo a motore"
        description="Targa, tipologia e primo autista. Semirimorchio, documenti e costi si gestiscono poi nella scheda."
        action={
          <Link className="secondary-button" href="/vehicles/tractors">
            <ArrowLeft size={16} aria-hidden />
            Torna ai mezzi a motore
          </Link>
        }
      />
      {resolvedSearchParams.error ? <p className="form-error" style={{ marginBottom: 16 }}>{resolvedSearchParams.error}</p> : null}
      <section className="panel">
        <form action={createTractorAction} className="form-stack">
          <div className="form-grid">
            <label>
              Targa
              <input name="plate" required />
            </label>
            <label>
              Tipologia
              <select name="vehicleType" defaultValue="">
                <option value="">Da classificare</option>
                {MOTOR_VEHICLE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {getMotorVehicleTypeLabel(type)}
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
              Autista iniziale
              <select name="assignedDriverId" defaultValue="">
                <option value="">Nessuno</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {`${driver.lastName} ${driver.firstName}`.trim()}
                  </option>
                ))}
              </select>
            </label>
            <DatePartsInput
              label="Associazione dal"
              name="assignmentValidFrom"
              defaultValue={toDateInputValue(today)}
            />
          </div>
          <label>
            Note
            <textarea name="notes" />
          </label>
          <div className="actions-row">
            <button className="primary-button" type="submit">
              <Save size={16} aria-hidden />
              Salva mezzo
            </button>
            <Link className="secondary-button" href="/vehicles/tractors">
              Annulla
            </Link>
          </div>
        </form>
      </section>
    </>
  );
}
