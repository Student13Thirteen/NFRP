import { ContainerTripStatus, TripBillingStatus } from '@prisma/client';
import { Save } from 'lucide-react';
import { ContainerRows, ContainerStopRows, type ContainerRowValue, type ContainerStopRowValue } from '@/components/ContainerTripRows';
import { DatePartsInput } from '@/components/DatePartsInput';
import { getContainerTripStatusLabel, getTripBillingStatusLabel } from '@/lib/container-trips';
import type { TripSelectOption } from '@/lib/trips';

export type ContainerTripFormValues = {
  tripDate?: string;
  status?: ContainerTripStatus;
  billingStatus?: TripBillingStatus;
  waybillNumber?: string | null;
  waybillDate?: string;
  customerCode?: string | null;
  customerName?: string | null;
  customerReference?: string | null;
  carrierName?: string | null;
  driverId?: string | null;
  tractorId?: string | null;
  trailerId?: string | null;
  loadingTerminalName?: string | null;
  deliveryTerminalName?: string | null;
  booking?: string | null;
  ship?: string | null;
  pickupCode?: string | null;
  deliveryCode?: string | null;
  shippingCompany?: string | null;
  forwarder?: string | null;
  plannedKm?: number | null;
  odometerStartKm?: number | null;
  odometerEndKm?: number | null;
  actualKm?: number | null;
  distanceSource?: string | null;
  freightRevenue?: string;
  carrierCost?: string;
  tollCost?: string;
  economicNotes?: string | null;
  notes?: string | null;
  containers?: ContainerRowValue[];
  stops?: ContainerStopRowValue[];
};

type Props = {
  action: (formData: FormData) => Promise<void>;
  drivers: TripSelectOption[];
  tractors: TripSelectOption[];
  trailers: TripSelectOption[];
  defaultValues?: ContainerTripFormValues;
  showStatus?: boolean;
  submitLabel: string;
};

function options(values: TripSelectOption[]) {
  return values.map((value) => (
    <option value={value.id} key={value.id}>{value.label}{value.active === false ? ' (non attivo)' : ''}</option>
  ));
}

export function ContainerTripForm({ action, drivers, tractors, trailers, defaultValues, showStatus = false, submitLabel }: Props) {
  const draftStatuses: ContainerTripStatus[] = [
    ContainerTripStatus.PLANNED,
    ContainerTripStatus.IN_PROGRESS,
    ContainerTripStatus.AWAITING_DRIVER_DATA,
    ContainerTripStatus.UNDER_REVIEW,
    ContainerTripStatus.CANCELLED
  ];
  const currentStatus = defaultValues?.status;
  const statusOptions = currentStatus && !draftStatuses.includes(currentStatus)
    ? [currentStatus]
    : draftStatuses;

  return (
    <form action={action} className="form-stack">
      <div className="form-section-title">Identificazione e committente</div>
      <div className="form-grid">
        <DatePartsInput label="Data viaggio" name="tripDate" defaultValue={defaultValues?.tripDate} required />
        <label>
          Numero lettera di vettura
          <input name="waybillNumber" defaultValue={defaultValues?.waybillNumber || ''} />
        </label>
        <DatePartsInput label="Data lettera di vettura" name="waybillDate" defaultValue={defaultValues?.waybillDate} />
        <label>
          Codice committente
          <input name="customerCode" defaultValue={defaultValues?.customerCode || ''} />
        </label>
        <label>
          Nome committente
          <input name="customerName" defaultValue={defaultValues?.customerName || ''} />
        </label>
        <label>
          Riferimento committente
          <input name="customerReference" defaultValue={defaultValues?.customerReference || ''} placeholder="Ordine, pratica o booking" />
        </label>
      </div>

      <div className="form-section-title">Autista e mezzo</div>
      <div className="form-grid">
        <label>
          Autista
          <select name="driverId" defaultValue={defaultValues?.driverId || ''}>
            <option value="">Non assegnato</option>
            {options(drivers)}
          </select>
        </label>
        <label>
          Trattore
          <select name="tractorId" defaultValue={defaultValues?.tractorId || ''}>
            <option value="">Non assegnato</option>
            {options(tractors)}
          </select>
        </label>
        <label>
          Semirimorchio
          <select name="trailerId" defaultValue={defaultValues?.trailerId || ''}>
            <option value="">Non assegnato</option>
            {options(trailers)}
          </select>
        </label>
        <label>
          Vettore / sub-vettore
          <input name="carrierName" defaultValue={defaultValues?.carrierName || ''} />
        </label>
      </div>

      <div className="form-section-title">Container</div>
      <ContainerRows defaultRows={defaultValues?.containers} />

      <div className="form-section-title">Terminal, nave e riferimenti</div>
      <div className="form-grid">
        <label>
          Terminal di carico
          <input name="loadingTerminalName" defaultValue={defaultValues?.loadingTerminalName || ''} />
        </label>
        <label>
          Terminal di consegna
          <input name="deliveryTerminalName" defaultValue={defaultValues?.deliveryTerminalName || ''} />
        </label>
        <label>
          Booking
          <input name="booking" defaultValue={defaultValues?.booking || ''} />
        </label>
        <label>
          Nave
          <input name="ship" defaultValue={defaultValues?.ship || ''} />
        </label>
        <label>
          Codice ritiro / PIN
          <input name="pickupCode" defaultValue={defaultValues?.pickupCode || ''} />
        </label>
        <label>
          Codice consegna
          <input name="deliveryCode" defaultValue={defaultValues?.deliveryCode || ''} />
        </label>
        <label>
          Compagnia
          <input name="shippingCompany" defaultValue={defaultValues?.shippingCompany || ''} />
        </label>
        <label>
          Transitario
          <input name="forwarder" defaultValue={defaultValues?.forwarder || ''} />
        </label>
      </div>

      <div className="form-section-title">Tappe operative</div>
      <p className="muted" style={{ marginTop: -8 }}>
        Ogni presa, consegna, dogana o sosta resta una riga autonoma: in questo modo i viaggi con più indirizzi non vengono compressi.
      </p>
      <ContainerStopRows defaultRows={defaultValues?.stops} />

      <div className="form-section-title">Completamento autista e chilometri</div>
      <div className="form-grid">
        <label>
          Km pianificati
          <input name="plannedKm" type="number" min={0} defaultValue={defaultValues?.plannedKm ?? ''} />
        </label>
        <label>
          Contachilometri partenza
          <input name="odometerStartKm" type="number" min={0} defaultValue={defaultValues?.odometerStartKm ?? ''} />
        </label>
        <label>
          Contachilometri arrivo
          <input name="odometerEndKm" type="number" min={0} defaultValue={defaultValues?.odometerEndKm ?? ''} />
        </label>
        <label>
          Km effettivi dichiarati
          <input name="actualKm" type="number" min={0} defaultValue={defaultValues?.actualKm ?? ''} />
        </label>
        <label>
          Origine dato km
          <select name="distanceSource" defaultValue={defaultValues?.distanceSource || ''}>
            <option value="">Da indicare</option>
            <option value="CONTACHILOMETRI">Contachilometri</option>
            <option value="DRIVER_APP">App autista</option>
            <option value="PHOTO_REVIEWED">Foto verificata</option>
            <option value="MANUAL">Inserimento manuale</option>
          </select>
        </label>
      </div>

      <details className="trip-extra-details" open={showStatus}>
        <summary>Economia e fatturazione</summary>
        <div className="form-grid">
          <label>
            Ricavo base
            <input name="freightRevenue" inputMode="decimal" defaultValue={defaultValues?.freightRevenue || ''} placeholder="Es. 850,00" />
          </label>
          <label>
            Costo vettore
            <input name="carrierCost" inputMode="decimal" defaultValue={defaultValues?.carrierCost || ''} />
          </label>
          <label>
            Pedaggi
            <input name="tollCost" inputMode="decimal" defaultValue={defaultValues?.tollCost || ''} />
          </label>
          <label>
            Stato fatturazione
            <select name="billingStatus" defaultValue={defaultValues?.billingStatus || TripBillingStatus.NOT_READY}>
              {Object.values(TripBillingStatus).map((status) => (
                <option key={status} value={status}>{getTripBillingStatusLabel(status)}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Note economiche
          <textarea name="economicNotes" rows={3} defaultValue={defaultValues?.economicNotes || ''} />
        </label>
      </details>

      {showStatus ? (
        <label>
          Stato operativo
          <select name="status" defaultValue={defaultValues?.status || ContainerTripStatus.PLANNED}>
            {statusOptions.map((status) => (
              <option key={status} value={status}>{getContainerTripStatusLabel(status)}</option>
            ))}
          </select>
          <span className="field-help">Per chiudere il viaggio usa l&apos;azione dedicata in fondo alla scheda.</span>
        </label>
      ) : (
        <input name="status" type="hidden" value={defaultValues?.status || ContainerTripStatus.PLANNED} />
      )}

      <label>
        Note viaggio
        <textarea name="notes" rows={4} defaultValue={defaultValues?.notes || ''} />
      </label>

      <button className="primary-button" type="submit">
        <Save size={16} aria-hidden />
        {submitLabel}
      </button>
    </form>
  );
}
