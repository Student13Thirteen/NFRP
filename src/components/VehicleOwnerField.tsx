'use client';

import { useId, useState } from 'react';
import { Plus, X } from 'lucide-react';

export type VehicleOwnerOptionView = {
  id: string;
  name: string;
  active: boolean;
};

type VehicleOwnerFieldProps = {
  options: VehicleOwnerOptionView[];
  idFieldName?: string;
  nameFieldName?: string;
  defaultOwnerId?: string | null;
  defaultOwnerName?: string | null;
  label?: string;
  hint?: string;
  disabled?: boolean;
};

/**
 * Proprietario di un mezzo non aziendale: si sceglie dalla tendina se e gia
 * stato registrato, altrimenti si scrive e viene salvato in anagrafica al primo
 * utilizzo. Senza JavaScript restano visibili entrambi i campi e il server
 * applica la stessa regola.
 */
export function VehicleOwnerField({
  options,
  idFieldName = 'vehicleOwnerId',
  nameFieldName = 'vehicleOwnerName',
  defaultOwnerId,
  defaultOwnerName,
  label = 'Proprietario del mezzo',
  hint = 'Se non e in elenco scrivilo: viene salvato in anagrafica e la volta dopo lo trovi in tendina.',
  disabled = false
}: VehicleOwnerFieldProps) {
  const fieldId = useId();
  const [selected, setSelected] = useState(defaultOwnerId || '');
  const [creating, setCreating] = useState(Boolean(defaultOwnerName) && !defaultOwnerId);

  return (
    <div className="vehicle-owner-field">
      <div className="field-label-row">
        <label className="field-label" htmlFor={fieldId}>{label}</label>
        <button
          className="field-inline-action"
          type="button"
          disabled={disabled}
          aria-expanded={creating}
          onClick={() => {
            setCreating((current) => !current);
            if (!creating) setSelected('');
          }}
        >
          {creating ? <X size={15} aria-hidden /> : <Plus size={15} aria-hidden />}
          {creating ? 'Scegli dall elenco' : 'Nuovo proprietario'}
        </button>
      </div>
      {creating ? (
        <input
          name={nameFieldName}
          defaultValue={defaultOwnerName || ''}
          placeholder="Ragione sociale o nome del proprietario"
          disabled={disabled}
          maxLength={160}
        />
      ) : (
        <select
          id={fieldId}
          name={idFieldName}
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          disabled={disabled}
        >
          <option value="">Non indicato</option>
          {options.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.name}
              {owner.active ? '' : ' (non attivo)'}
            </option>
          ))}
        </select>
      )}
      <p className="muted">{hint}</p>
    </div>
  );
}
