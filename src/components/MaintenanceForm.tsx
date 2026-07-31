import { MaintenanceStatus } from '@prisma/client';
import { Save } from 'lucide-react';
import { DatePartsInput } from '@/components/DatePartsInput';
import { FileUpload } from '@/components/FileUpload';
import {
  getMaintenanceStatusLabel,
  type MaintenanceSelectOption,
  type MaintenanceVehicleOption
} from '@/lib/maintenance';

type MaintenanceFormValues = {
  title?: string | null;
  categoryId?: string | null;
  status?: MaintenanceStatus;
  maintenanceDate?: string;
  documentDate?: string;
  supplierId?: string | null;
  documentNumber?: string | null;
  driverId?: string | null;
  vehicleKey?: string;
  odometerKm?: number | null;
  amount?: string;
  description?: string | null;
  notes?: string | null;
};

type MaintenanceFormProps = {
  action: string | ((formData: FormData) => Promise<void>);
  categories: MaintenanceSelectOption[];
  suppliers: MaintenanceSelectOption[];
  drivers: MaintenanceSelectOption[];
  vehicles: MaintenanceVehicleOption[];
  defaultValues?: MaintenanceFormValues;
  submitLabel: string;
  showStatus?: boolean;
  fileLabel?: string;
  disabled?: boolean;
};

function renderOptions(options: Array<MaintenanceSelectOption | MaintenanceVehicleOption>, valueKey: 'id' | 'value' = 'id') {
  return options.map((option) => (
    <option key={valueKey === 'value' && 'value' in option ? option.value : option.id} value={valueKey === 'value' && 'value' in option ? option.value : option.id}>
      {option.label}
      {option.active === false ? ' (non attivo)' : ''}
    </option>
  ));
}

export function MaintenanceForm({
  action,
  categories,
  suppliers,
  drivers,
  vehicles,
  defaultValues,
  submitLabel,
  showStatus = false,
  fileLabel = 'PDF manutenzione opzionale',
  disabled = false
}: MaintenanceFormProps) {
  return (
    <form action={action} method={typeof action === 'string' ? 'post' : undefined} className="form-stack" encType="multipart/form-data">
      <div className="form-section-title">Intervento</div>
      <div className="form-grid">
        <DatePartsInput label="Data intervento" name="maintenanceDate" defaultValue={defaultValues?.maintenanceDate} required />
        <label>
          Mezzo
          <select name="vehicleKey" defaultValue={defaultValues?.vehicleKey || ''} disabled={disabled}>
            <option value="">Non associata</option>
            {renderOptions(vehicles, 'value')}
          </select>
        </label>
        <label>
          Categoria
          <select name="categoryId" defaultValue={defaultValues?.categoryId || ''} required disabled={disabled}>
            <option value="">Seleziona categoria</option>
            {renderOptions(categories)}
          </select>
        </label>
        <label>
          Fornitore / officina
          <select name="supplierId" defaultValue={defaultValues?.supplierId || ''} disabled={disabled}>
            <option value="">Non indicato</option>
            {renderOptions(suppliers)}
          </select>
        </label>
      </div>

      <div className="form-grid">
        <label>
          Autista
          <select name="driverId" defaultValue={defaultValues?.driverId || ''} disabled={disabled}>
            <option value="">Non associato</option>
            {renderOptions(drivers)}
          </select>
        </label>
      </div>

      <label>
        Descrizione rapida
        <textarea
          name="description"
          rows={4}
          defaultValue={defaultValues?.description || ''}
          placeholder="Es. Sostituzione radiatore, antigelo 30 L, controllo circuito raffreddamento"
          required
          disabled={disabled}
        />
      </label>

      <div className="form-section-title">Documento e costi</div>
      <div className="form-grid">
        <DatePartsInput label="Data documento" name="documentDate" defaultValue={defaultValues?.documentDate} />
        <label>
          Numero documento
          <input name="documentNumber" defaultValue={defaultValues?.documentNumber || ''} placeholder="Fattura, DDT o scheda" disabled={disabled} />
        </label>
        <label>
          Km
          <input name="odometerKm" type="number" min={0} defaultValue={defaultValues?.odometerKm ?? ''} disabled={disabled} />
        </label>
        <label>
          Importo
          <input name="amount" inputMode="decimal" defaultValue={defaultValues?.amount || ''} placeholder="Es. 1720,20" disabled={disabled} />
        </label>
      </div>

      <div className="form-grid">
        <label>
          Titolo
          <input name="title" defaultValue={defaultValues?.title || ''} placeholder="Generato automaticamente se vuoto" disabled={disabled} />
        </label>
        <FileUpload label={fileLabel} name="file" />
      </div>

      {showStatus ? (
        <label>
          Stato
          <select name="status" defaultValue={defaultValues?.status || MaintenanceStatus.COMPLETED}>
            {Object.values(MaintenanceStatus).map((status) => (
              <option key={status} value={status}>
                {getMaintenanceStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input name="status" type="hidden" value={defaultValues?.status || MaintenanceStatus.COMPLETED} />
      )}

      <label>
        Note interne
        <textarea name="notes" rows={3} defaultValue={defaultValues?.notes || ''} disabled={disabled} />
      </label>

      <button className="primary-button" type="submit" disabled={disabled}>
        <Save size={16} aria-hidden />
        {submitLabel}
      </button>
    </form>
  );
}
