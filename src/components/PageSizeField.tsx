import { DEFAULT_PAGE_SIZE, getPageSizeOption } from '@/lib/pagination';

type PageSizeFieldProps = {
  pageSize?: string;
};

/**
 * Conserva il numero di righe scelto quando l'operatore applica un filtro.
 * I filtri degli elenchi sono form GET: senza questo campo nascosto ogni
 * ricerca riportava la lista a 50 righe anche dopo aver scelto 100, 200 o
 * "Tutte". Il taglio predefinito non viene scritto nella URL.
 */
export function PageSizeField({ pageSize }: PageSizeFieldProps) {
  const value = getPageSizeOption(pageSize);
  if (value === String(DEFAULT_PAGE_SIZE)) return null;
  return <input type="hidden" name="pageSize" value={value} />;
}
