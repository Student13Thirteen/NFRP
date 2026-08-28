'use client';

import { type ChangeEvent, type DragEvent, useId, useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileImage, FileText, UploadCloud, X } from 'lucide-react';

type InboxFileUploadProps = {
  maxSizeMb?: number;
  context?: 'inbox' | 'road-fines' | 'container-trips';
};

export function InboxFileUpload({ maxSizeMb = 20, context = 'inbox' }: InboxFileUploadProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  function isPdf(file: File) {
    return file.type === 'application/pdf' || file.name.toLocaleLowerCase('it-IT').endsWith('.pdf');
  }

  function isImage(file: File) {
    return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || /\.(?:jpe?g|png|webp)$/iu.test(file.name);
  }

  function isAccepted(file: File) {
    return isPdf(file) || (context === 'container-trips' && isImage(file));
  }

  function validateFiles(input: HTMLInputElement, selectedFiles: File[]) {
    input.setCustomValidity('');

    const invalidFile = selectedFiles.find((file) => !isAccepted(file));
    if (invalidFile) {
      input.setCustomValidity(context === 'container-trips'
        ? `"${invalidFile.name}" non è un PDF o un'immagine JPG, PNG o WebP.`
        : `"${invalidFile.name}" non è un PDF.`);
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

    if (valid && submitAfterDrop) {
      input.form?.requestSubmit();
    }
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
        accept={context === 'container-trips'
          ? 'application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp'
          : 'application/pdf,.pdf'}
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
          <strong>{isDragging
            ? context === 'container-trips' ? 'Rilascia bolle da analizzare' : 'Rilascia PDF da analizzare'
            : files.length
              ? `${files.length} ${context === 'container-trips' ? 'file selezionati' : 'PDF selezionati'}`
              : context === 'container-trips' ? 'Seleziona PDF o immagini da analizzare' : 'Seleziona PDF da analizzare'}</strong>
          <small>
            {isDragging
              ? context === 'road-fines'
                ? 'Il rilascio avvia l’analisi dei verbali'
                : context === 'container-trips'
                  ? 'Il rilascio avvia l’analisi delle bolle container'
                  : 'Il drop avvia il caricamento in inbox'
              : files.length
              ? context === 'road-fines'
                ? `${Math.max(1, Math.round(totalSize / 1024))} KB totali, pronti per l’acquisizione dei verbali`
                : context === 'container-trips'
                  ? `${Math.max(1, Math.round(totalSize / 1024))} KB totali, pronti per la revisione container`
                  : `${Math.max(1, Math.round(totalSize / 1024))} KB totali, pronti per la coda inbox`
              : context === 'container-trips'
                ? `PDF, JPG, PNG o WebP fino a ${maxSizeMb} MB ciascuno`
                : `Upload multiplo, PDF fino a ${maxSizeMb} MB ciascuno`}
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
                {isImage(file) ? <FileImage size={15} aria-hidden /> : <FileText size={15} aria-hidden />}
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
