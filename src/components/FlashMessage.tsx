'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import type { FlashMessagePayload } from '@/lib/flash';
import { MANAGED_IMPORT_NOTICE_KEY } from '@/lib/managed-import';

type FlashMessageProps = {
  flash: FlashMessagePayload | null;
};

const icons = {
  success: CheckCircle2,
  info: Info,
  error: AlertTriangle
};

export function FlashMessage({ flash }: FlashMessageProps) {
  const [activeFlash, setActiveFlash] = useState<FlashMessagePayload | null>(flash);
  const [visible, setVisible] = useState(Boolean(flash));

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let storedFlash: FlashMessagePayload | null = null;
    try {
      const stored = window.sessionStorage.getItem(MANAGED_IMPORT_NOTICE_KEY);
      window.sessionStorage.removeItem(MANAGED_IMPORT_NOTICE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<FlashMessagePayload>;
        if (
          (parsed.type === 'success' || parsed.type === 'info' || parsed.type === 'error') &&
          typeof parsed.title === 'string' &&
          (parsed.message === undefined || typeof parsed.message === 'string')
        ) {
          storedFlash = {
            type: parsed.type,
            title: parsed.title,
            message: parsed.message,
            createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now()
          };
        }
      }
    } catch {
      storedFlash = null;
    }

    const nextFlash = flash ?? storedFlash;
    if (flash) fetch('/api/flash', { method: 'DELETE', keepalive: true }).catch(() => {});

    queueMicrotask(() => {
      if (cancelled) return;
      setActiveFlash(nextFlash);
      setVisible(Boolean(nextFlash));
      if (nextFlash) timer = window.setTimeout(() => setVisible(false), 5200);
    });

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [flash]);

  if (!activeFlash || !visible) return null;

  const Icon = icons[activeFlash.type];

  return (
    <div className="feedback-region" aria-live="polite" aria-atomic="true">
      <div className={`feedback-banner ${activeFlash.type}`} role="status">
        <Icon size={20} aria-hidden />
        <div>
          <strong>{activeFlash.title}</strong>
          {activeFlash.message ? <span>{activeFlash.message}</span> : null}
        </div>
        <button className="feedback-close" type="button" aria-label="Chiudi notifica" onClick={() => setVisible(false)}>
          <X size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}
