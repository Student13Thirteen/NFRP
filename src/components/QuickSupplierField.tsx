'use client';

import { useId, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';

export type QuickSupplierOption = {
  id: string;
  label: string;
  active?: boolean;
};

type QuickSupplierFieldProps = {
  options: QuickSupplierOption[];
  defaultValue?: string | null;
  disabled?: boolean;
  label?: string;
  emptyLabel?: string;
};

const emptyDraft = {
  name: '',
  phone: '',
  email: '',
  vatNumber: '',
  taxCode: '',
  pecEmail: '',
  address: '',
  postalCode: '',
  city: '',
  province: '',
  country: '',
  notes: ''
};

export function QuickSupplierField({
  options,
  defaultValue,
  disabled = false,
  label = 'Fornitore / officina',
  emptyLabel = 'Non indicato'
}: QuickSupplierFieldProps) {
  const fieldId = useId();
  const [available, setAvailable] = useState(options);
  const [selected, setSelected] = useState(defaultValue || '');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  function updateDraft(key: keyof typeof emptyDraft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function createSupplier() {
    if (!draft.name.trim()) {
      setFeedback({ type: 'error', message: 'Inserisci il nome del fornitore.' });
      return;
    }
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft)
      });
      const payload = await response.json() as {
        error?: string;
        message?: string;
        supplier?: { id: string; name: string; active: boolean };
      };
      if (!response.ok || !payload.supplier) throw new Error(payload.error || 'Salvataggio non riuscito.');
      const option = { id: payload.supplier.id, label: payload.supplier.name, active: payload.supplier.active };
      setAvailable((current) => current.some((item) => item.id === option.id) ? current : [...current, option].sort((a, b) => a.label.localeCompare(b.label, 'it')));
      setSelected(option.id);
      setDraft(emptyDraft);
      setOpen(false);
      setFeedback({ type: 'success', message: payload.message || 'Fornitore selezionato.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Salvataggio non riuscito.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="quick-supplier-field">
      <div className="field-label-row">
        <label className="field-label" htmlFor={fieldId}>{label}</label>
        <button
          className="field-inline-action"
          type="button"
          onClick={() => {
            setOpen((current) => !current);
            setFeedback(null);
          }}
          disabled={disabled}
          aria-expanded={open}
        >
          {open ? <X size={15} aria-hidden /> : <Plus size={15} aria-hidden />}
          {open ? 'Chiudi' : 'Nuovo fornitore'}
        </button>
      </div>
      <select id={fieldId} name="supplierId" value={selected} onChange={(event) => setSelected(event.target.value)} disabled={disabled}>
        <option value="">{emptyLabel}</option>
        {available.map((supplier) => (
          <option key={supplier.id} value={supplier.id}>
            {supplier.label}{supplier.active === false ? ' (non attivo)' : ''}
          </option>
        ))}
      </select>

      {open ? (
        <div className="quick-supplier-card" aria-label="Creazione rapida fornitore">
          <div className="quick-supplier-heading">
            <div>
              <strong>Aggiungi senza lasciare questa scheda</strong>
              <span>Basta il nome. Recapiti e indirizzo possono essere completati anche dopo.</span>
            </div>
          </div>
          <div className="form-grid">
            <label>
              Nome fornitore
              <input value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} autoFocus required />
            </label>
            <label>
              Telefono
              <input value={draft.phone} onChange={(event) => updateDraft('phone', event.target.value)} />
            </label>
            <label>
              Email
              <input type="email" value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} />
            </label>
          </div>
          <details>
            <summary>Dati fiscali, indirizzo e note</summary>
            <div className="form-grid quick-supplier-details">
              <label>
                Partita IVA
                <input inputMode="numeric" value={draft.vatNumber} onChange={(event) => updateDraft('vatNumber', event.target.value)} />
              </label>
              <label>
                Codice fiscale
                <input value={draft.taxCode} onChange={(event) => updateDraft('taxCode', event.target.value)} />
              </label>
              <label>
                PEC
                <input type="email" value={draft.pecEmail} onChange={(event) => updateDraft('pecEmail', event.target.value)} />
              </label>
              <label>
                Via / indirizzo
                <input value={draft.address} onChange={(event) => updateDraft('address', event.target.value)} />
              </label>
              <label>
                CAP
                <input value={draft.postalCode} onChange={(event) => updateDraft('postalCode', event.target.value)} />
              </label>
              <label>
                Citta
                <input value={draft.city} onChange={(event) => updateDraft('city', event.target.value)} />
              </label>
              <label>
                Provincia
                <input value={draft.province} onChange={(event) => updateDraft('province', event.target.value)} />
              </label>
              <label>
                Nazione
                <input value={draft.country} onChange={(event) => updateDraft('country', event.target.value)} />
              </label>
              <label>
                Note
                <input value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} />
              </label>
            </div>
          </details>
          <button className="primary-button compact-button" type="button" onClick={createSupplier} disabled={pending}>
            <Plus size={15} aria-hidden />
            {pending ? 'Salvataggio…' : 'Crea e seleziona'}
          </button>
        </div>
      ) : null}

      {feedback ? (
        <p className={`inline-feedback ${feedback.type}`} role="status">
          {feedback.type === 'success' ? <Check size={15} aria-hidden /> : null}
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
