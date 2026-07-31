import { WarehouseStatus } from '@prisma/client';
import { Save } from 'lucide-react';
import { DatePartsInput } from '@/components/DatePartsInput';
import { FileUpload } from '@/components/FileUpload';
import { getWarehouseStatusLabel, type WarehouseSelectOption } from '@/lib/warehouse';

type WarehouseFormValues = {
  title?: string | null;
  categoryId?: string | null;
  status?: WarehouseStatus;
  stockedAt?: string;
  documentDate?: string;
  supplierId?: string | null;
  documentNumber?: string | null;
  code?: string | null;
  quantity?: number | null;
  unit?: string | null;
  minimumQuantity?: number | null;
  location?: string | null;
  amount?: string;
  description?: string | null;
  notes?: string | null;
};

type WarehouseFormProps = {
  action: string | ((formData: FormData) => Promise<void>);
  categories: WarehouseSelectOption[];
  suppliers: WarehouseSelectOption[];
  defaultValues?: WarehouseFormValues;
  submitLabel: string;
  showStatus?: boolean;
  fileLabel?: string;
  disabled?: boolean;
};

function renderOptions(options: WarehouseSelectOption[]) {
  return options.map((option) => (
    <option key={option.id} value={option.id}>
      {option.label}
      {option.active === false ? ' (non attiva)' : ''}
    </option>
  ));
}

export function WarehouseForm({
  action,
  categories,
  suppliers,
  defaultValues,
  submitLabel,
  showStatus = false,
  fileLabel = 'PDF documento opzionale',
  disabled = false
}: WarehouseFormProps) {
  return (
    <form action={action} method={typeof action === 'string' ? 'post' : undefined} className="form-stack" encType="multipart/form-data">
      <div className="form-section-title">Materiale</div>
      <div className="form-grid">
        <DatePartsInput label="Data carico" name="stockedAt" defaultValue={defaultValues?.stockedAt} required />
        <label>
          Categoria
          <select name="categoryId" defaultValue={defaultValues?.categoryId || ''} required disabled={disabled}>
            <option value="">Seleziona categoria</option>
            {renderOptions(categories)}
          </select>
        </label>
        <label>
          Fornitore
          <select name="supplierId" defaultValue={defaultValues?.supplierId || ''} disabled={disabled}>
            <option value="">Non indicato</option>
            {renderOptions(suppliers)}
          </select>
        </label>
      </div>
      <input name="location" type="hidden" defaultValue={defaultValues?.location || ''} />
      <input name="code" type="hidden" defaultValue={defaultValues?.code || ''} />
      <input name="minimumQuantity" type="hidden" defaultValue={defaultValues?.minimumQuantity ?? ''} />

      <label>
        Descrizione rapida
        <textarea
          name="description"
          rows={4}
          defaultValue={defaultValues?.description || ''}
          placeholder="Es. Pneumatici 385/65 R22.5, filtro gasolio, tanica AdBlue"
          required
          disabled={disabled}
        />
      </label>

      <div className="form-section-title">Quantita e documento</div>
      <div className="form-grid">
        <label>
          Quantita
          <input name="quantity" type="number" min={0} defaultValue={defaultValues?.quantity ?? 1} required disabled={disabled} />
        </label>
        <label>
          Unita
          <input name="unit" defaultValue={defaultValues?.unit || 'pz'} placeholder="pz, L, kg" required disabled={disabled} />
        </label>
        <DatePartsInput label="Data documento" name="documentDate" defaultValue={defaultValues?.documentDate} />
        <label>
          Numero documento
          <input name="documentNumber" defaultValue={defaultValues?.documentNumber || ''} placeholder="Fattura, DDT, ricevuta" disabled={disabled} />
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
          <select name="status" defaultValue={defaultValues?.status || WarehouseStatus.IN_STOCK}>
            {Object.values(WarehouseStatus).map((status) => (
              <option key={status} value={status}>
                {getWarehouseStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

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
