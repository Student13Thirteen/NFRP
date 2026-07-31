import { VehicleLifecycleStatus } from '@prisma/client';
import { DatePartsInput } from '@/components/DatePartsInput';
import { toDateInputValue } from '@/lib/dates';
import { getVehicleLifecycleLabel } from '@/lib/vehicle-lifecycle';

type VehicleLifecycleFieldsProps = {
  endedAt: Date | null;
  status: VehicleLifecycleStatus;
};

export function VehicleLifecycleFields({ endedAt, status }: VehicleLifecycleFieldsProps) {
  return (
    <div className="vehicle-lifecycle-fields">
      <label>
        Stato del mezzo
        <select name="lifecycleStatus" defaultValue={status}>
          {Object.values(VehicleLifecycleStatus).map((value) => (
            <option key={value} value={value}>{getVehicleLifecycleLabel(value)}</option>
          ))}
        </select>
        <small>Venduto o rottamato rimuove la targa dall&apos;operativita, senza cancellare lo storico.</small>
      </label>
      <DatePartsInput
        label="Data uscita flotta (facoltativa)"
        name="lifecycleEndedAt"
        defaultValue={toDateInputValue(endedAt)}
      />
    </div>
  );
}
