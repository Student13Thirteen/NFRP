import type { Customer } from '@prisma/client';
import { RegistryFiscalFields } from '@/components/RegistryFiscalFields';

type CustomerDefaults = Partial<Pick<
  Customer,
  | 'code'
  | 'name'
  | 'vatNumber'
  | 'taxCode'
  | 'pecEmail'
  | 'address'
  | 'postalCode'
  | 'city'
  | 'province'
  | 'country'
  | 'notes'
>>;

type CustomerFormFieldsProps = {
  defaultValues?: CustomerDefaults;
};

export function CustomerFormFields({ defaultValues }: CustomerFormFieldsProps) {
  return (
    <>
      <div className="form-section-title">Identificazione</div>
      <div className="form-grid">
        <label>
          Ragione sociale
          <input name="name" defaultValue={defaultValues?.name || ''} required />
        </label>
        <label>
          Codice cliente
          <input name="code" defaultValue={defaultValues?.code || ''} placeholder="Codice gestionale facoltativo" />
        </label>
      </div>

      <div className="form-section-title">Dati fiscali</div>
      <div className="form-grid">
        <RegistryFiscalFields defaultValues={defaultValues} />
      </div>

      <div className="form-section-title">Sede</div>
      <div className="form-grid">
        <label>
          Via / indirizzo
          <input name="address" defaultValue={defaultValues?.address || ''} />
        </label>
        <label>
          CAP
          <input name="postalCode" defaultValue={defaultValues?.postalCode || ''} />
        </label>
        <label>
          Citta
          <input name="city" defaultValue={defaultValues?.city || ''} />
        </label>
        <label>
          Provincia
          <input name="province" defaultValue={defaultValues?.province || ''} />
        </label>
        <label>
          Nazione
          <input name="country" defaultValue={defaultValues?.country || ''} placeholder="Italia" />
        </label>
      </div>
      <label>
        Note
        <textarea name="notes" rows={3} defaultValue={defaultValues?.notes || ''} />
      </label>
    </>
  );
}
