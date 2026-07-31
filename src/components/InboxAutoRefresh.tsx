'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

type InboxAutoRefreshProps = {
  // Numero di item ancora in analisi: finché è > 0 la pagina si ricarica da sola per mostrare i risultati.
  pendingCount: number;
  intervalMs?: number;
};

// Aggiorna la pagina inbox mentre ci sono analisi OCR in corso, così i suggerimenti compaiono senza che
// l'utente debba ricaricare a mano. Si ferma da solo quando non resta nulla in analisi.
export function InboxAutoRefresh({ pendingCount, intervalMs = 4000 }: InboxAutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    if (pendingCount <= 0) return;
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [pendingCount, intervalMs, router]);

  return null;
}
