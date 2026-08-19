import { requireUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

/**
 * L'inserimento manuale e unificato: una manutenzione con una riga o con venti
 * si registra sempre da `/maintenances/new`. La vecchia rotta resta valida per i
 * collegamenti salvati.
 */
export default async function LegacyNewExpenseDocumentPage() {
  await requireUser();
  redirect('/maintenances/new');
}
