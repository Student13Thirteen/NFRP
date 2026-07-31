'use client';

import { type ChangeEvent, type DragEvent, useId, useRef, useState } from 'react';
import { CheckCircle2, FileText, UploadCloud } from 'lucide-react';

type FileUploadProps = {
  label: string;
  name: string;
  required?: boolean;
  maxSizeMb?: number;
};

export function FileUpload({ label, name, required = false, maxSizeMb = 20 }: FileUploadProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  function isPdf(file: File) {
    return file.type === 'application/pdf' || file.name.toLocaleLowerCase('it-IT').endsWith('.pdf');
  }

  function setSelection(input: HTMLInputElement, file?: File) {
    setFileName(file?.name || '');
    input.setCustomValidity('');

    if (!file) {
      return;
    }

    if (!isPdf(file)) {
      input.setCustomValidity('Sono accettati solo file PDF.');
      input.reportValidity();
      return;
    }

    if (file.size > maxSizeMb * 1024 * 1024) {
      input.setCustomValidity(`Il file supera il limite di ${maxSizeMb} MB.`);
      input.reportValidity();
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setSelection(event.target, event.target.files?.[0]);
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
    const file = event.dataTransfer.files[0];
    if (!input || !file) return;

    const droppedFile = new DataTransfer();
    droppedFile.items.add(file);
    input.files = droppedFile.files;
    setSelection(input, file);
  }

  return (
    <div className="file-upload-field">
      <span className="field-label">{label}</span>
      <input
        ref={inputRef}
        id={id}
        className="file-upload-input"
        name={name}
        type="file"
        accept="application/pdf,.pdf"
        required={required}
        onChange={handleChange}
      />
      <label
        className={`file-dropzone${fileName ? ' has-file' : ''}${isDragging ? ' is-dragging' : ''}`}
        htmlFor={id}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="file-dropzone-icon">
          {fileName ? <CheckCircle2 size={22} aria-hidden /> : <UploadCloud size={22} aria-hidden />}
        </span>
        <span className="file-dropzone-copy">
          <strong>{isDragging ? 'Rilascia PDF' : fileName || (required ? 'Seleziona PDF' : 'Seleziona PDF, se disponibile')}</strong>
          <small>
            {isDragging
              ? 'File pronto per il form'
              : fileName
                ? 'File pronto per il caricamento'
                : required
                  ? `PDF, massimo ${maxSizeMb} MB`
                  : 'Puoi salvarlo anche senza file'}
          </small>
        </span>
        <FileText className="file-dropzone-mark" size={20} aria-hidden />
      </label>
    </div>
  );
}
