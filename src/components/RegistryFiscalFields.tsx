type FiscalDefaults = {
  vatNumber?: string | null;
  taxCode?: string | null;
  pecEmail?: string | null;
};

type RegistryFiscalFieldsProps = {
  defaultValues?: FiscalDefaults;
};

export function RegistryFiscalFields({ defaultValues }: RegistryFiscalFieldsProps) {
  return (
    <>
      <label>
        Partita IVA
        <input
          name="vatNumber"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={defaultValues?.vatNumber || ''}
          placeholder="11 cifre"
        />
      </label>
      <label>
        Codice fiscale
        <input
          name="taxCode"
          autoCapitalize="characters"
          autoComplete="off"
          defaultValue={defaultValues?.taxCode || ''}
          placeholder="11 cifre o 16 caratteri"
        />
      </label>
      <label>
        PEC
        <input
          name="pecEmail"
          type="email"
          autoComplete="email"
          defaultValue={defaultValues?.pecEmail || ''}
          placeholder="ufficio@pec.it"
        />
      </label>
    </>
  );
}
