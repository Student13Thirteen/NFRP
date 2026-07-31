import { getDatePartValue, type DateFilterPrefix } from '@/lib/date-filters';

type DatePartFiltersProps = {
  label: string;
  prefix: DateFilterPrefix;
  date: Date | null;
  years: number[];
};

const monthLabels = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

export function DatePartFilters({ label, prefix, date, years }: DatePartFiltersProps) {
  return (
    <fieldset className="date-part-filter">
      <legend>{label}</legend>
      <div className="date-part-inputs">
        <select name={`${prefix}Day`} defaultValue={getDatePartValue(date, 'day')} aria-label={`${label} giorno`}>
          <option value="">Gg</option>
          {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
        <select name={`${prefix}Month`} defaultValue={getDatePartValue(date, 'month')} aria-label={`${label} mese`}>
          <option value="">Mese</option>
          {monthLabels.map((month, index) => (
            <option key={month} value={index + 1}>
              {month}
            </option>
          ))}
        </select>
        <select name={`${prefix}Year`} defaultValue={getDatePartValue(date, 'year')} aria-label={`${label} anno`}>
          <option value="">Anno</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}
