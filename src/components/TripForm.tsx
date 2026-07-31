import { TripBillingStatus, TripStatus } from '@prisma/client';
import { Save } from 'lucide-react';
import { DatePartsInput } from '@/components/DatePartsInput';
import { TripProductRows, type TripProductRowValue } from '@/components/TripProductRows';
import { getTripBillingStatusLabel, getTripStatusLabel, type TripSelectOption } from '@/lib/trips';

type TripFormValues = {
  tripDate?: string;
  loadingBaseId?: string;
  salesPointId?: string;
  driverId?: string | null;
  tractorId?: string | null;
  trailerId?: string | null;
  sequenceNumber?: number | null;
  expectedKm?: number | null;
  odometerStartKm?: number | null;
  odometerEndKm?: number | null;
  productId?: string | null;
  liters?: number;
  productLines?: TripProductRowValue[];
  status?: TripStatus;
  billingStatus?: TripBillingStatus;
  customerName?: string | null;
  customerReference?: string | null;
  carrierName?: string | null;
  transportDocumentNumber?: string | null;
  transportDocumentDate?: string;
  invoiceNumber?: string | null;
  invoiceDate?: string;
  freightRevenue?: string;
  carrierCost?: string;
  tollCost?: string;
  extraCost?: string;
  economicNotes?: string | null;
  notes?: string | null;
};

type TripFormProps = {
  action: (formData: FormData) => Promise<void>;
  loadingBases: TripSelectOption[];
  salesPoints: TripSelectOption[];
  drivers: TripSelectOption[];
  tractors: TripSelectOption[];
  trailers: TripSelectOption[];
  products: TripSelectOption[];
  defaultValues?: TripFormValues;
  showStatus?: boolean;
  submitLabel: string;
  disabled?: boolean;
};

function renderOptions(options: TripSelectOption[]) {
  return options.map((option) => (
    <option key={option.id} value={option.id}>
      {option.label}
      {option.active === false ? ' (non attivo)' : ''}
    </option>
  ));
}

export function TripForm({
  action,
  loadingBases,
  salesPoints,
  drivers,
  tractors,
  trailers,
  products,
  defaultValues,
  showStatus = false,
  submitLabel,
  disabled = false
}: TripFormProps) {
  return (
    <form action={action} className="form-stack">
      <div className="form-section-title">Dati viaggio</div>
      <div className="form-grid">
        <DatePartsInput label="Data viaggio" name="tripDate" defaultValue={defaultValues?.tripDate} required />
        <label>
          Sequenza viaggio
          <input name="sequenceNumber" type="number" min={1} defaultValue={defaultValues?.sequenceNumber ?? 1} />
        </label>
        <label>
          Base di carico
          <select name="loadingBaseId" defaultValue={defaultValues?.loadingBaseId || ''} required disabled={disabled}>
            <option value="">Seleziona base</option>
            {renderOptions(loadingBases)}
          </select>
        </label>
      </div>

      <div className="form-section-title">Autista e mezzo</div>
      <div className="form-grid">
        <label>
          Autista
          <select name="driverId" defaultValue={defaultValues?.driverId || ''} disabled={disabled}>
            <option value="">Non assegnato</option>
            {renderOptions(drivers)}
          </select>
        </label>
        <label>
          Targa trattore
          <select name="tractorId" defaultValue={defaultValues?.tractorId || ''} disabled={disabled}>
            <option value="">Non assegnata</option>
            {renderOptions(tractors)}
          </select>
        </label>
        <label>
          Targa rimorchio
          <select name="trailerId" defaultValue={defaultValues?.trailerId || ''} disabled={disabled}>
            <option value="">Non assegnata</option>
            {renderOptions(trailers)}
          </select>
        </label>
        <label>
          Km previsti
          <input name="expectedKm" type="number" min={0} defaultValue={defaultValues?.expectedKm ?? ''} />
        </label>
        <label>
          Km partenza
          <input name="odometerStartKm" type="number" min={0} defaultValue={defaultValues?.odometerStartKm ?? ''} />
        </label>
        <label>
          Km arrivo
          <input name="odometerEndKm" type="number" min={0} defaultValue={defaultValues?.odometerEndKm ?? ''} />
        </label>
      </div>

      <div className="form-section-title">Carico e tappe</div>
      <TripProductRows
        salesPoints={salesPoints}
        products={products}
        defaultRows={
          defaultValues?.productLines || [
            {
              salesPointId: defaultValues?.salesPointId,
              productId: defaultValues?.productId,
              liters: defaultValues?.liters
            }
          ]
        }
        disabled={disabled}
      />

      <details className="trip-extra-details" open={showStatus}>
        <summary>Dati gestionali e centro costi</summary>
        <div className="form-grid">
          <label>
            Cliente / committente
            <input name="customerName" defaultValue={defaultValues?.customerName || ''} placeholder="Es. TIBER SRL" disabled={disabled} />
          </label>
          <label>
            Riferimento ordine
            <input
              name="customerReference"
              defaultValue={defaultValues?.customerReference || ''}
              placeholder="Ordine, spedizione o pratica"
              disabled={disabled}
            />
          </label>
          <label>
            Trasportatore / sub-vettore
            <input name="carrierName" defaultValue={defaultValues?.carrierName || ''} placeholder="Se diverso da flotta interna" disabled={disabled} />
          </label>
          <label>
            Numero DDT
            <input name="transportDocumentNumber" defaultValue={defaultValues?.transportDocumentNumber || ''} disabled={disabled} />
          </label>
        </div>

        <div className="form-grid">
          <DatePartsInput label="Data DDT" name="transportDocumentDate" defaultValue={defaultValues?.transportDocumentDate} />
          <label>
            Stato fatturazione
            <select name="billingStatus" defaultValue={defaultValues?.billingStatus || TripBillingStatus.NOT_READY} disabled={disabled}>
              {Object.values(TripBillingStatus).map((status) => (
                <option key={status} value={status}>
                  {getTripBillingStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Numero fattura
            <input name="invoiceNumber" defaultValue={defaultValues?.invoiceNumber || ''} disabled={disabled} />
          </label>
          <DatePartsInput label="Data fattura" name="invoiceDate" defaultValue={defaultValues?.invoiceDate} />
        </div>

        <div className="form-grid form-grid-amounts">
          <label>
            Ricavo viaggio
            <input name="freightRevenue" inputMode="decimal" defaultValue={defaultValues?.freightRevenue || ''} placeholder="Es. 850,00" disabled={disabled} />
          </label>
          <label>
            Costo trasportatore
            <input name="carrierCost" inputMode="decimal" defaultValue={defaultValues?.carrierCost || ''} placeholder="Es. 500,00" disabled={disabled} />
          </label>
          <label>
            Pedaggi imputati
            <input name="tollCost" inputMode="decimal" defaultValue={defaultValues?.tollCost || ''} placeholder="Es. 75,50" disabled={disabled} />
          </label>
          <label>
            Costi extra
            <input name="extraCost" inputMode="decimal" defaultValue={defaultValues?.extraCost || ''} placeholder="Es. 30,00" disabled={disabled} />
          </label>
        </div>

        <label>
          Note economiche
          <textarea
            name="economicNotes"
            rows={2}
            defaultValue={defaultValues?.economicNotes || ''}
            placeholder="Es. attesa, ribaltamento, differenze tariffa, accordi cliente"
            disabled={disabled}
          />
        </label>
      </details>

      {showStatus ? (
        <label>
          Stato
          <select name="status" defaultValue={defaultValues?.status || TripStatus.PLANNED}>
            {Object.values(TripStatus).map((status) => (
              <option key={status} value={status}>
                {getTripStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input name="status" type="hidden" value={defaultValues?.status || TripStatus.PLANNED} />
      )}

      <label>
        Note aggiuntive viaggio
        <textarea
          name="notes"
          rows={3}
          defaultValue={defaultValues?.notes || ''}
          placeholder="Es. base Sonatrach tramite altra azienda"
        />
      </label>

      <button className="primary-button" type="submit" disabled={disabled}>
        <Save size={16} aria-hidden />
        {submitLabel}
      </button>
    </form>
  );
}
