import { requireUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

type LegacyExpensesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Il registro fatture/DDT e confluito nel registro unico delle manutenzioni.
 * La rotta resta valida e conserva i filtri gia impostati.
 */
export default async function LegacyExpensesPage({ searchParams }: LegacyExpensesPageProps) {
  await requireUser();
  const resolved = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === 'string' && value !== '') params.set(key, value);
  }
  const query = params.toString();
  redirect(query ? `/maintenances?${query}` : '/maintenances');
}
