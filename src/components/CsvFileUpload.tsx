'use client';

import { type ChangeEvent, type DragEvent, useId, useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, UploadCloud, X } from 'lucide-react';

type CsvFileUploadProps = {
  maxSizeMb?: number;
};

export function CsvFileUpload({ maxSizeMb = 20 }: CsvFileUploadProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  function isCsv(file: File) {
    const lowerName = file.name.toLocaleLowerCase('it-IT');
    return lowerName.endsWith('.csv') || ['text/csv', 'text/plain', 'application/vnd.ms-excel'].includes(file.type);
  }

  function validateFiles(input: HTMLInputElement, selectedFiles: File[]) {
    input.setCustomValidity('');

    const nonCsv = selectedFiles.find((file) => !isCsv(file));
    if (nonCsv) {
      input.setCustomValidity(`"${nonCsv.name}" non e un CSV.`);
      input.reportValidity();
      return false;
    }

    const oversized = selectedFiles.find((file) => file.size > maxSizeMb * 1024 * 1024);
    if (oversized) {
      input.setCustomValidity(`"${oversized.name}" supera il limite di ${maxSizeMb} MB.`);
      input.reportValidity();
      return false;
    }

    return selectedFiles.length > 0;
  }

  function setSelection(input: HTMLInputElement, selectedFiles: File[], submitAfterDrop = false) {
    setFiles(selectedFiles);
    const valid = validateFiles(input, selectedFiles);
    if (valid && submitAfterDrop) input.form?.requestSubmit();
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setSelection(event.target, Array.from(event.target.files || []));
  }

  function handleDragEnter(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);

    const input = inputRef.current;
    if (!input || event.dataTransfer.files.length === 0) return;

    input.files = event.dataTransfer.files;
    setSelection(input, Array.from(event.dataTransfer.files), true);
  }

  function clearSelection() {
    setFiles([]);
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.setCustomValidity('');
    }
  }

  return (
    <div className="inbox-upload-field">
      <input
        ref={inputRef}
        id={id}
        className="file-upload-input"
        name="files"
        type="file"
        accept=".csv,text/csv,text/plain"
        multiple
        required
        onChange={handleChange}
      />
      <label
        className={`inbox-upload-surface${files.length ? ' has-files' : ''}${isDragging ? ' is-dragging' : ''}`}
        htmlFor={id}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="inbox-upload-icon">
          {files.length ? <CheckCircle2 size={24} aria-hidden /> : <UploadCloud size={24} aria-hidden />}
        </span>
        <span className="inbox-upload-copy">
          <strong>{isDragging ? 'Rilascia CSV autostrade' : files.length ? `${files.length} CSV selezionati` : 'Seleziona CSV autostrade'}</strong>
          <small>
            {isDragging
              ? 'Il drop avvia il caricamento'
              : files.length
                ? `${Math.max(1, Math.round(totalSize / 1024))} KB totali`
                : `Upload multiplo, CSV fino a ${maxSizeMb} MB ciascuno`}
          </small>
        </span>
        <span className="inbox-upload-action">Scegli file</span>
      </label>

      {files.length ? (
        <div className="inbox-upload-list">
          <div className="inbox-upload-list-head">
            <span>File selezionati</span>
            <button type="button" onClick={clearSelection} aria-label="Rimuovi selezione">
              <X size={15} aria-hidden />
              Pulisci
            </button>
          </div>
          <ul>
            {files.slice(0, 8).map((file) => (
              <li key={`${file.name}:${file.size}:${file.lastModified}`}>
                <FileSpreadsheet size={15} aria-hidden />
                <span>{file.name}</span>
                <small>{Math.max(1, Math.round(file.size / 1024))} KB</small>
              </li>
            ))}
          </ul>
          {files.length > 8 ? <p className="muted">Altri {files.length - 8} file selezionati.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
