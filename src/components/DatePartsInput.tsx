'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type DatePartsInputProps = {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
};

type DateParts = {
  day: string;
  month: string;
  year: string;
};

function parseDefaultValue(value?: string): DateParts {
  if (!value) return { day: '', month: '', year: '' };
  const [year, month, day] = value.split('-');
  return {
    day: day || '',
    month: month || '',
    year: year || ''
  };
}

function pad(value: string): string {
  return value.padStart(2, '0');
}

function isValidDate(parts: DateParts): boolean {
  if (!parts.day && !parts.month && !parts.year) return false;
  if (parts.day.length < 1 || parts.month.length < 1 || parts.year.length !== 4) return false;

  const day = Number(parts.day);
  const month = Number(parts.month);
  const year = Number(parts.year);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return false;
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function toIsoDate(parts: DateParts, required: boolean): string {
  if (!parts.day && !parts.month && !parts.year && !required) return '';
  if (!isValidDate(parts)) return '';
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function DatePartsInput({ label, name, defaultValue, required = false }: DatePartsInputProps) {
  const yearSelectRef = useRef<HTMLSelectElement>(null);
  const [parts, setParts] = useState<DateParts>(() => parseDefaultValue(defaultValue));
  const isoValue = toIsoDate(parts, required);
  const hasAnyValue = Boolean(parts.day || parts.month || parts.year);
  const isComplete = Boolean(isoValue);

  const currentYear = new Date().getFullYear();
  const years = useMemo(
    () => Array.from({ length: 81 }, (_, index) => String(currentYear - 20 + index)),
    [currentYear]
  );

  function updatePart(key: keyof DateParts, value: string) {
    setParts((current) => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    const shouldValidate = required || hasAnyValue;
    yearSelectRef.current?.setCustomValidity(shouldValidate && !isComplete ? 'Seleziona una data valida in formato gg/mm/aaaa.' : '');
  }, [hasAnyValue, isComplete, required]);

  return (
    <div className="date-parts-field">
      <span className="field-label">{label}</span>
      <input name={name} type="hidden" value={isoValue} />
      <div className="date-parts" aria-label={`${label} in formato giorno mese anno`}>
        <select
          aria-label={`${label}: giorno`}
          onChange={(event) => updatePart('day', event.target.value)}
          required={required}
          value={parts.day}
        >
          <option value="">gg</option>
          {Array.from({ length: 31 }, (_, index) => {
            const value = pad(String(index + 1));
            return (
              <option key={value} value={value}>
                {value}
              </option>
            );
          })}
        </select>
        <span aria-hidden>/</span>
        <select
          aria-label={`${label}: mese`}
          onChange={(event) => updatePart('month', event.target.value)}
          required={required}
          value={parts.month}
        >
          <option value="">mm</option>
          {Array.from({ length: 12 }, (_, index) => {
            const value = pad(String(index + 1));
            return (
              <option key={value} value={value}>
                {value}
              </option>
            );
          })}
        </select>
        <span aria-hidden>/</span>
        <select
          ref={yearSelectRef}
          aria-label={`${label}: anno`}
          onChange={(event) => updatePart('year', event.target.value)}
          required={required}
          value={parts.year}
        >
          <option value="">aaaa</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
