import { ContainerTripStatus, TripBillingStatus } from '@prisma/client';
import { Save } from 'lucide-react';
import { ContainerRows, ContainerStopRows, type ContainerRowValue, type ContainerStopRowValue } from '@/components/ContainerTripRows';
import { ContainerTripCalculatedFields } from '@/components/ContainerTripCalculatedFields';
import { GuidedChoiceField } from '@/components/GuidedChoiceField';
import { DatePartsInput } from '@/components/DatePartsInput';
import { RecoverableForm } from '@/components/RecoverableForm';
import { VehicleOwnerField, type VehicleOwnerOptionView } from '@/components/VehicleOwnerField';
import { getContainerTripStatusLabel, getTripBillingStatusLabel } from '@/lib/container-trips';
import type { TripSelectOption } from '@/lib/trips';

export type ContainerTripFormValues = {
  tripDate?: string;
  status?: ContainerTripStatus;
  billingStatus?: TripBillingStatus;
  waybillNumber?: string | null;
  waybillDate?: string;
  customerId?: string | null;
  customerCode?: string | null;
  customerName?: string | null;
  customerReference?: string | null;
  carrierName?: string | null;
  routeSequence?: string | null;
  driverId?: string | null;
  tractorId?: string | null;
  trailerId?: string | null;
  externalTractorPlate?: string | null;
  externalTractorOwnerId?: string | null;
  externalTrailerPlate?: string | null;
  externalTrailerOwnerId?: string | null;
  loadingTerminalName?: string | null;
  deliveryTerminalName?: string | null;
  returnBaseName?: string | null;
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
  additionalCostType?: string | null;
  additionalCost?: string;
  economicNotes?: string | null;
  notes?: string | null;
  containers?: ContainerRowValue[];
  stops?: ContainerStopRowValue[];
};

export type ContainerTripFormSuggestions = {
  locations: string[];
  carriers: string[];
};

type Props = {
  action: (formData: FormData) => Promise<void>;
  drivers: TripSelectOption[];
  tractors: TripSelectOption[];
  trailers: TripSelectOption[];
  customers: TripSelectOption[];
  vehicleOwners: VehicleOwnerOptionView[];
  defaultValues?: ContainerTripFormValues;
  showStatus?: boolean;
  submitLabel: string;
  recoverOnError?: boolean;
  recoveryKey?: string;
  suggestions?: ContainerTripFormSuggestions;
};

// Voci del foglio operativo container (colonna COSTI AGGIUNTIVI, scelta a tenda).
const ADDITIONAL_COST_TYPES = [
  'Sosta maggiore di 3 ore',
  'Sosta maggiore di 8 ore',
  'ADR',
  'Frigo',
  'Dogana',
  'Pesa'
];

function options(values: TripSelectOption[]) {
  return values.map((value) => (
    <option value={value.id} key={value.id}>{value.label}{value.active === false ? ' (non attivo)' : ''}</option>
  ));
}

export function ContainerTripForm({
  action,
  drivers,
  tractors,
  trailers,
  customers,
  vehicleOwners,
  defaultValues,
  showStatus = false,
  submitLabel,
  recoverOnError = false,
  recoveryKey = 'container-trip',
  suggestions = { locations: [], carriers: [] }
}: Props) {
  const hasExternalVehicle = Boolean(defaultValues?.externalTractorPlate || defaultValues?.externalTrailerPlate);
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
    <RecoverableForm action={action} className="form-stack" recoveryKey={recoveryKey} recoverOnError={recoverOnError}>
      <div className="form-section-title">Identificazione e committente</div>
      <div className="form-grid">
        <DatePartsInput label="Data viaggio" name="tripDate" defaultValue={defaultValues?.tripDate} required />
        <label>
          Numero lettera di vettura
          <input name="waybillNumber" defaultValue={defaultValues?.waybillNumber || ''} />
        </label>
        <DatePartsInput label="Data lettera di vettura" name="waybillDate" defaultValue={defaultValues?.waybillDate} />
        <label>
          Cliente in anagrafica
          <select name="customerId" defaultValue={defaultValues?.customerId || ''}>
            <option value="">Nuovo / non ancora registrato</option>
            {options(customers)}
          </select>
          <span className="field-help">Se selezionato, ragione sociale e codice dell&apos;anagrafica hanno la precedenza.</span>
        </label>
        <label>
          Codice nuovo committente
          <input name="customerCode" defaultValue={defaultValues?.customerCode || ''} />
        </label>
        <label>
          Nome nuovo committente
          <input name="customerName" defaultValue={defaultValues?.customerName || ''} />
        </label>
        <label>
          Riferimento committente
          <input name="customerReference" defaultValue={defaultValues?.customerReference || ''} placeholder="Ordine, pratica o booking" />
        </label>
      </div>
      <label>
        Sequenza viaggio
        <textarea
          name="routeSequence"
          rows={3}
          defaultValue={defaultValues?.routeSequence || ''}
          placeholder="Es. Genova → Firenze → Genova"
        />
        <span className="field-help">Descrivi liberamente l&apos;ordine operativo; le singole consegne restano anche nelle tappe sottostanti.</span>
      </label>

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
        <GuidedChoiceField
          label="Trasportatore"
          name="carrierName"
          options={suggestions.carriers}
          defaultValue={defaultValues?.carrierName}
          emptyLabel="Non indicato"
          customLabel="Altro trasportatore: scrivilo"
          customPlaceholder="Ragione sociale del vettore"
        />
      </div>

      <details className="external-vehicle-block" open={hasExternalVehicle}>
        <summary>Mezzi non aziendali (facoltativo)</summary>
        <p className="muted">
          Per un viaggio fatto con targhe di terzi scrivi qui la targa e il proprietario: il mezzo non entra in flotta e
          non genera scadenze. Compila la targa esterna solo se sopra hai lasciato &quot;Non assegnato&quot;.
        </p>
        <div className="form-grid">
          <label>
            Targa trattore non nostro
            <input
              name="externalTractorPlate"
              defaultValue={defaultValues?.externalTractorPlate || ''}
              placeholder="Es. AB123CD"
              maxLength={20}
            />
          </label>
          <VehicleOwnerField
            options={vehicleOwners}
            idFieldName="externalTractorOwnerId"
            nameFieldName="externalTractorOwnerName"
            defaultOwnerId={defaultValues?.externalTractorOwnerId}
            label="Proprietario del trattore"
            hint="Serve solo se hai indicato una targa trattore non aziendale."
          />
          <label>
            Targa semirimorchio non nostro
            <input
              name="externalTrailerPlate"
              defaultValue={defaultValues?.externalTrailerPlate || ''}
              placeholder="Es. XA123AB"
              maxLength={20}
            />
          </label>
          <VehicleOwnerField
            options={vehicleOwners}
            idFieldName="externalTrailerOwnerId"
            nameFieldName="externalTrailerOwnerName"
            defaultOwnerId={defaultValues?.externalTrailerOwnerId}
            label="Proprietario del semirimorchio"
            hint="Serve solo se hai indicato una targa semirimorchio non aziendale."
          />
        </div>
      </details>

      <div className="form-section-title">Percorso: carico, consegne e rientro</div>
      <div className="form-grid three">
        <GuidedChoiceField
          label="Base di carico"
          name="loadingTerminalName"
          options={suggestions.locations}
          defaultValue={defaultValues?.loadingTerminalName}
          customLabel="Altra base: scrivila"
          customPlaceholder="Nome della base o del terminal"
        />
        <GuidedChoiceField
          label="Luogo di consegna"
          name="deliveryTerminalName"
          options={suggestions.locations}
          defaultValue={defaultValues?.deliveryTerminalName}
          customLabel="Altro luogo: scrivilo"
          customPlaceholder="Nome del luogo o del terminal"
        />
        <GuidedChoiceField
          label="Base di rientro"
          name="returnBaseName"
          options={suggestions.locations}
          defaultValue={defaultValues?.returnBaseName}
          customLabel="Altra base: scrivila"
          customPlaceholder="Nome della base di rientro"
        />
      </div>

      <div className="form-section-title">Luoghi di consegna e tappe operative</div>
      <p className="muted" style={{ marginTop: -8 }}>
        Ogni presa, consegna, dogana o sosta resta una riga autonoma: in questo modo i viaggi con più indirizzi non vengono compressi.
      </p>
      <ContainerStopRows defaultRows={defaultValues?.stops} locationSuggestions={suggestions.locations} />

      <div className="form-section-title">Container</div>
      <ContainerRows defaultRows={defaultValues?.containers} />

      <div className="form-section-title">Nave e riferimenti</div>
      <div className="form-grid">
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
          Km reali dichiarati (se mancano i due contachilometri)
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

      <ContainerTripCalculatedFields group="km" />

      <details className="trip-extra-details" open>
        <summary>Costi, ricavi e fatturazione</summary>
        <div className="form-grid">
          <label>
            Ricavo base
            <input name="freightRevenue" inputMode="decimal" defaultValue={defaultValues?.freightRevenue || ''} placeholder="Es. 850,00" />
          </label>
          <label>
            Costo viaggio / vettore
            <input name="carrierCost" inputMode="decimal" defaultValue={defaultValues?.carrierCost || ''} />
          </label>
          <GuidedChoiceField
            label="Tipo costo aggiuntivo"
            name="additionalCostType"
            options={ADDITIONAL_COST_TYPES}
            defaultValue={defaultValues?.additionalCostType}
            emptyLabel="Nessun costo aggiuntivo"
            customLabel="Altra voce: scrivila"
            customPlaceholder="Descrivi il costo aggiuntivo"
          />
          <label>
            Importo costo aggiuntivo
            <input name="additionalCost" inputMode="decimal" defaultValue={defaultValues?.additionalCost || ''} placeholder="Es. 75,00" />
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
        <ContainerTripCalculatedFields group="rates" />
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
    </RecoverableForm>
  );
}
