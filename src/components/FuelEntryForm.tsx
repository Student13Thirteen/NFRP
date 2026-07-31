'use client';

import { useRef } from 'react';
import { Save } from 'lucide-react';
import { DatePartsInput } from '@/components/DatePartsInput';

type TractorOption = {
  id: string;
  plate: string;
  brand: string | null;
  model: string | null;
  active: boolean;
  assignedDriver?: {
    firstName: string;
    lastName: string;
  } | null;
};

type DriverOption = {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
};

type SupplierOption = {
  id: string;
  name: string;
  active: boolean;
};

type CardOption = {
  id: string;
  cardNumber: string;
  label: string | null;
  active: boolean;
  fuelSupplier: { name: string } | null;
  assignedTractor: { plate: string } | null;
};

type ProductOption = {
  id: string;
  code: string;
  name: string;
  isFuel: boolean;
  active: boolean;
};

export type FuelEntryFormDefaults = {
  fuelDate: string;
  fuelTime?: string | null;
  tractorId?: string | null;
  driverId?: string | null;
  fuelSupplierId?: string | null;
  fuelCardId?: string | null;
  cardNumber?: string | null;
  fuelProductId?: string | null;
  odometerKm?: number | null;
  volumeLiters?: string;
  grossPricePerLiter?: string;
  totalAmount?: string;
  receiptNumber?: string | null;
  invoiceNumber?: string | null;
  stationName?: string | null;
  supplierName?: string | null;
  notes?: string | null;
  manuallyVerified?: boolean;
};

type FuelEntryFormProps = {
  action: string;
  tractors: TractorOption[];
  drivers: DriverOption[];
  suppliers: SupplierOption[];
  cards: CardOption[];
  products: ProductOption[];
  defaultValues: FuelEntryFormDefaults;
  submitLabel: string;
};

function driverOptionLabel(driver: { firstName: string; lastName: string }): string {
  return `${driver.lastName} ${driver.firstName}`.trim();
}

function tractorOptionLabel(tractor: TractorOption): string {
  const details = [tractor.brand, tractor.model].filter(Boolean).join(' ');
  return details ? `${tractor.plate} - ${details}` : tractor.plate;
}

function cardLabel(card: CardOption): string {
  return [
    card.fuelSupplier?.name || 'Senza distributore',
    card.cardNumber,
    card.label || '',
    card.assignedTractor?.plate || '',
    card.active ? '' : '(non attiva)'
  ]
    .filter(Boolean)
    .join(' - ');
}

// Convenzione input manuale: il PUNTO e' il separatore decimale e non si usa
// alcun separatore di migliaia (es. 1.3 e 130000). Tolleriamo anche la virgola
// come decimale, per sicurezza.
function parseDecimalInput(value: string): number | null {
  if (!value.trim()) return null;
  const normalized = value.replace(',', '.').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// Riscriviamo i campi calcolati col punto decimale e senza separatore di
// migliaia (es. 1.823), cosi' il server li accetta cosi' come sono.
function formatDecimal(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

export function FuelEntryForm({
  action,
  tractors,
  drivers,
  suppliers,
  cards,
  products,
  defaultValues,
  submitLabel
}: FuelEntryFormProps) {
  const litersRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const totalRef = useRef<HTMLInputElement>(null);

  // Relazione: totale = litri x prezzo ivato €/L. Calcoliamo "al volo" il campo
  // complementare a quello che l'utente sta scrivendo, senza mai riscrivere il
  // campo su cui sta digitando.
  function recompute(source: 'liters' | 'price' | 'total') {
    const liters = parseDecimalInput(litersRef.current?.value ?? '');
    const price = parseDecimalInput(priceRef.current?.value ?? '');
    const total = parseDecimalInput(totalRef.current?.value ?? '');

    if (source === 'total') {
      // Sta scrivendo il totale -> ricavo il prezzo €/L.
      if (liters && total && priceRef.current) priceRef.current.value = formatDecimal(total / liters, 3);
      return;
    }

    // Sta scrivendo litri o prezzo.
    if (liters && price && totalRef.current) {
      totalRef.current.value = formatDecimal(liters * price, 2);
    } else if (source === 'liters' && liters && total && priceRef.current) {
      // Litri cambiati, prezzo vuoto ma totale presente -> ricavo il prezzo.
      priceRef.current.value = formatDecimal(total / liters, 3);
    }
  }

  return (
    <form action={action} method="post" className="form-stack">
      <div className="form-grid">
        <DatePartsInput label="Data" name="fuelDate" defaultValue={defaultValues.fuelDate} required />
        <label>
          Targa trattore
          <select name="tractorId" defaultValue={defaultValues.tractorId || ''} required>
            <option value="">Seleziona</option>
            {tractors.map((tractor) => (
              <option key={tractor.id} value={tractor.id}>
                {tractorOptionLabel(tractor)}
                {tractor.assignedDriver ? ` - ${driverOptionLabel(tractor.assignedDriver)}` : ''}
                {tractor.active ? '' : ' (non attivo)'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Prodotto
          <select name="fuelProductId" defaultValue={defaultValues.fuelProductId || ''} required>
            <option value="">Seleziona</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.code})
                {product.isFuel ? '' : ' - servizio (no €/km)'}
                {product.active ? '' : ' (non attivo)'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Km
          <input name="odometerKm" inputMode="numeric" defaultValue={defaultValues.odometerKm || ''} />
        </label>
      </div>

      <div className="form-grid form-grid-amounts">
        <label>
          Litri
          <input
            ref={litersRef}
            name="volumeLiters"
            inputMode="decimal"
            defaultValue={defaultValues.volumeLiters || ''}
            onChange={() => recompute('liters')}
            required
          />
        </label>
        <label>
          Prezzo ivato €/L
          <input
            ref={priceRef}
            name="grossPricePerLiter"
            inputMode="decimal"
            defaultValue={defaultValues.grossPricePerLiter || ''}
            onChange={() => recompute('price')}
          />
        </label>
        <label>
          Totale scontrino €
          <input
            ref={totalRef}
            name="totalAmount"
            inputMode="decimal"
            defaultValue={defaultValues.totalAmount || ''}
            onChange={() => recompute('total')}
          />
        </label>
      </div>
      <p className="muted fuel-amounts-hint">
        Inserisci <strong>litri</strong> + <strong>prezzo €/L</strong> e il totale si calcola da solo. In alternativa litri +
        totale per ricavare il prezzo. Per i decimali usa il <strong>punto</strong> (es. 1.823) e nessun separatore per le
        migliaia (es. 130000).
      </p>

      <details className="fuel-extra-details">
        <summary>Altri dettagli (facoltativi)</summary>
        <div className="form-grid">
          <label>
            Ora
            <input name="fuelTime" type="time" defaultValue={defaultValues.fuelTime || ''} />
          </label>
          <label>
            Autista
            <select name="driverId" defaultValue={defaultValues.driverId || ''}>
              <option value="">Automatico dal trattore</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driverOptionLabel(driver)}
                  {driver.active ? '' : ' (non attivo)'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Distributore
            <select name="fuelSupplierId" defaultValue={defaultValues.fuelSupplierId || ''}>
              <option value="">Nessuno</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                  {supplier.active ? '' : ' (non attivo)'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tessera registrata
            <select name="fuelCardId" defaultValue={defaultValues.fuelCardId || ''}>
              <option value="">Nessuna</option>
              {cards.map((card) => (
                <option key={card.id} value={card.id}>
                  {cardLabel(card)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tessera libera
            <input name="cardNumber" defaultValue={defaultValues.cardNumber || ''} placeholder="Solo se non registrata" />
          </label>
          <label>
            Numero scontrino
            <input name="receiptNumber" defaultValue={defaultValues.receiptNumber || ''} />
          </label>
          <label>
            Numero fattura
            <input name="invoiceNumber" defaultValue={defaultValues.invoiceNumber || ''} />
          </label>
          <label>
            Punto vendita
            <input name="stationName" defaultValue={defaultValues.stationName || ''} />
          </label>
          <label>
            Fornitore libero
            <input name="supplierName" defaultValue={defaultValues.supplierName || ''} />
          </label>
        </div>
        <label>
          Note
          <textarea name="notes" defaultValue={defaultValues.notes || ''} />
        </label>
        <label className="checkbox-row">
          <input name="manuallyVerified" type="checkbox" defaultChecked={defaultValues.manuallyVerified || false} />
          Verificato
        </label>
      </details>

      <button className="primary-button" type="submit">
        <Save size={16} aria-hidden />
        {submitLabel}
      </button>
    </form>
  );
}
