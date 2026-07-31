'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CheckCircle2, Loader2 } from 'lucide-react';

type ProgressEvent = {
  imported: number;
  message?: string;
  processed: number;
  skipped: number;
  total: number;
  type: 'progress' | 'complete' | 'error';
};

type InboxBulkValidateButtonProps = {
  confirmMessage: string;
  readyCount: number;
};

export function InboxBulkValidateButton({ confirmMessage, readyCount }: InboxBulkValidateButtonProps) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(readyCount);
  const [imported, setImported] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (running || readyCount === 0) {
      event.preventDefault();
      return;
    }
    if (!window.confirm(confirmMessage)) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    setRunning(true);
    setDone(false);
    setError(null);
    setProcessed(0);
    setImported(0);
    setSkipped(0);

    try {
      const response = await fetch('/api/document-inbox/validate-all', {
        method: 'POST',
        headers: { accept: 'text/event-stream' }
      });
      if (!response.ok || !response.body) throw new Error('Impossibile avviare la validazione massiva.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completed = false;

      while (true) {
        const { done: streamDone, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !streamDone });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          const dataLine = block.split('\n').find((line) => line.startsWith('data: '));
          if (!dataLine) continue;
          const update = JSON.parse(dataLine.slice(6)) as ProgressEvent;
          if (update.type === 'error') throw new Error(update.message || 'Validazione massiva non riuscita.');
          if (update.type === 'progress') {
            setProcessed(update.processed);
            setTotal(update.total);
            setImported(update.imported);
            setSkipped(update.skipped);
          }
          if (update.type === 'complete') {
            completed = true;
            setImported(update.imported);
            setSkipped(update.skipped);
            setTotal(update.total);
            setProcessed(update.total);
          }
        }

        if (streamDone) break;
      }

      if (!completed) throw new Error('La connessione si e chiusa prima della conferma finale.');
      setDone(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Validazione massiva non riuscita.');
    } finally {
      setRunning(false);
    }
  }

  const percent = done ? 100 : total > 0 ? Math.round((processed / total) * 100) : 0;
  const showProgress = running || done || error !== null;
  const label = error
    ? error
    : done
      ? `${imported} PDF importati${skipped > 0 ? `, ${skipped} lasciati da revisionare` : ''}.`
      : `Importazione definitiva: ${processed}/${total}`;

  return (
    <div className="inbox-bulk-validation">
      <button className="primary-button" type="submit" disabled={readyCount === 0 || running} onClick={handleClick}>
        {running ? <Loader2 size={16} aria-hidden className="spin" /> : <Check size={16} aria-hidden />}
        {running ? 'Validazione in corso…' : `Valida e sostituisci tutti riconosciuti (${readyCount})`}
      </button>
      {showProgress ? (
        <div className={`inbox-progress${error ? ' is-error' : ''}${done && !error ? ' is-done' : ''}`} role="status">
          <div className="inbox-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <div className="inbox-progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <div className="inbox-progress-label">
            {done && !error ? <CheckCircle2 size={15} aria-hidden /> : null}
            <span>{label}</span>
            {!error ? <strong>{percent}%</strong> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
