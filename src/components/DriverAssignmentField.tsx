'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { findDatedDriverAssignment, type DatedDriverAssignment } from '@/lib/driver-assignment-core';

type DriverOption = {
  id: string;
  label: string;
  active?: boolean;
};

type DriverAssignmentFieldProps = {
  assignments: DatedDriverAssignment[];
  drivers: DriverOption[];
  tractorId?: string | null;
  date?: string;
  defaultDriverId?: string | null;
  disabled?: boolean;
};

function driverLabel(assignment: DatedDriverAssignment): string {
  if (!assignment.driver) return 'Autista associato';
  return `${assignment.driver.lastName} ${assignment.driver.firstName}`.trim();
}

export function DriverAssignmentField({
  assignments,
  drivers,
  tractorId,
  date,
  defaultDriverId,
  disabled = false
}: DriverAssignmentFieldProps) {
  const [selectedDriverId, setSelectedDriverId] = useState(defaultDriverId || '');
  const resolved = findDatedDriverAssignment(assignments, tractorId, date);
  const selectedDriver = drivers.find((driver) => driver.id === selectedDriverId);

  return (
    <div className="driver-assignment-field">
      <label>
        Autista
        <select
          name="driverId"
          value={selectedDriverId}
          onChange={(event) => setSelectedDriverId(event.target.value)}
          disabled={disabled}
        >
          <option value="">
            Automatico: {resolved ? driverLabel(resolved) : 'nessun autista associato alla data'}
          </option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.label}{driver.active === false ? ' (non attivo)' : ''}
            </option>
          ))}
        </select>
      </label>
      {selectedDriver ? (
        <p className="field-context neutral">
          Scelta manuale: <strong>{selectedDriver.label}</strong>. Prevale sull&apos;associazione automatica.
        </p>
      ) : !tractorId ? (
        <p className="field-context neutral">Scegli un mezzo associato a un trattore per usare l&apos;autista automatico.</p>
      ) : !date ? (
        <p className="field-context neutral">Completa la data per individuare l&apos;autista corretto.</p>
      ) : resolved ? (
        <p className="field-context success">
          <CheckCircle2 size={15} aria-hidden />
          Alla data scelta: <strong>{driverLabel(resolved)}</strong>
        </p>
      ) : (
        <p className="field-context warning">
          <CircleAlert size={15} aria-hidden />
          Nessuna associazione valida per questa data.
          <Link href={`/vehicles/tractors/${tractorId}#driver-assignments`} target="_blank">Gestisci periodi</Link>
        </p>
      )}
    </div>
  );
}
