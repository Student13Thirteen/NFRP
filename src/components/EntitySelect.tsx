'use client';

import { KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { EntityOption } from '@/lib/entities';

type EntitySelectProps = {
  options: EntityOption[];
  defaultValue?: string;
  name?: string;
  required?: boolean;
  label?: string;
  placeholder?: string;
  emptyLabel?: string;
  onValueChange?: (value: string) => void;
};

type VisibleOption =
  | { key: string; label: string; group: string; active: boolean; empty?: false }
  | { key: string; label: string; group: string; active: boolean; empty: true };

function normalize(value: string) {
  return value
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function optionText(option: Pick<EntityOption, 'group' | 'label' | 'active'>) {
  return `${option.group}: ${option.label}${option.active ? '' : ' (non attivo)'}`;
}

export function EntitySelect({
  options,
  defaultValue,
  name = 'entityKey',
  required = true,
  label = 'Associato a',
  placeholder = 'Cerca autista, targa o altro...',
  emptyLabel = 'Tutti',
  onValueChange
}: EntitySelectProps) {
  const listId = useId();
  const initialKey = defaultValue || '';
  const initialOption = options.find((option) => option.key === initialKey);
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const [query, setQuery] = useState(initialOption ? optionText(initialOption) : '');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((option) => option.key === selectedKey);

  useEffect(() => {
    inputRef.current?.setCustomValidity(required && !selectedKey ? 'Seleziona un risultato dalla lista.' : '');
  }, [required, selectedKey]);

  const visibleOptions = useMemo<VisibleOption[]>(() => {
    const selectedText = selectedOption ? optionText(selectedOption) : '';
    const search = normalize(query.trim() === selectedText ? '' : query.trim());
    const matches = options.filter((option) => {
      if (!search) return true;
      return normalize(`${option.group} ${option.label} ${option.active ? 'attivo' : 'non attivo'}`).includes(search);
    });

    const allOption: VisibleOption[] =
      required || (search && !normalize(emptyLabel).includes(search))
        ? []
        : [{ key: '', label: emptyLabel, group: 'Filtro', active: true, empty: true }];

    return [...allOption, ...matches].slice(0, 80);
  }, [emptyLabel, options, query, required, selectedOption]);

  function selectOption(option: VisibleOption) {
    setSelectedKey(option.key);
    setQuery(option.empty ? '' : optionText(option));
    setOpen(false);
    onValueChange?.(option.key);
  }

  function handleInput(value: string) {
    setQuery(value);
    setOpen(true);
    setActiveIndex(0);

    if (selectedOption && value !== optionText(selectedOption)) {
      setSelectedKey('');
      if (!required) onValueChange?.('');
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      setOpen(true);
      return;
    }

    if (!open) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, Math.max(visibleOptions.length - 1, 0)));
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    }

    if (event.key === 'Enter' && visibleOptions[activeIndex]) {
      event.preventDefault();
      selectOption(visibleOptions[activeIndex]);
    }

    if (event.key === 'Escape') {
      setOpen(false);
      setQuery(selectedOption ? optionText(selectedOption) : '');
    }
  }

  return (
    <div className="combobox">
      <span className="field-label">{label}</span>
      <input name={name} type="hidden" value={selectedKey} />
      <div className="combobox-control">
        <Search className="combobox-search-icon" size={16} aria-hidden />
        <input
          ref={inputRef}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          autoComplete="off"
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => handleInput(event.target.value)}
          onFocus={() => {
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          role="combobox"
          value={query}
        />
        <button className="combobox-toggle" type="button" onClick={() => setOpen((current) => !current)} aria-label="Apri elenco">
          <ChevronDown size={16} aria-hidden />
        </button>
      </div>

      {open ? (
        <div className="combobox-menu" id={listId} role="listbox">
          {visibleOptions.length === 0 ? <div className="combobox-empty">Nessun risultato</div> : null}
          {visibleOptions.map((option, index) => (
            <button
              className={`combobox-option${index === activeIndex ? ' is-active' : ''}${option.key === selectedKey ? ' is-selected' : ''}`}
              key={`${option.group}:${option.key || 'empty'}`}
              onClick={() => selectOption(option)}
              onMouseDown={(event) => event.preventDefault()}
              type="button"
            >
              <span>
                <strong>{option.label}</strong>
                <small>{option.empty ? 'Nessun filtro entità' : `${option.group}${option.active ? '' : ' - non attivo'}`}</small>
              </span>
              {option.key === selectedKey ? <Check size={16} aria-hidden /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
