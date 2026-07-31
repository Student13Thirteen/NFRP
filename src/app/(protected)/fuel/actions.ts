'use server';

import { requireUser } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { recalculateFuelMetricsForPlates } from '@/lib/fuel-import';
import { setFlashMessage } from '@/lib/flash';

function redirectWithError(path: string, message: string): never {
  const params = new URLSearchParams({ error: message });
  redirect(`${path}?${params.toString()}`);
}

function getFuelActionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 300);
  return 'Operazione non riuscita. Riprova.';
}

export async function deleteFuelEntryAction(id: string) {
  await requireUser();
  const entry = await prisma.fuelEntry.findUnique({ where: { id }, select: { id: true, plate: true } });
  if (!entry) redirectWithError('/fuel', 'Rifornimento non trovato.');

  try {
    await prisma.fuelEntry.delete({ where: { id } });
    await recalculateFuelMetricsForPlates(prisma, [entry.plate]);
  } catch (error) {
    console.error('Eliminazione rifornimento fallita.', error);
    redirectWithError(`/fuel/${id}`, getFuelActionErrorMessage(error));
  }

  revalidatePath('/fuel');
  await setFlashMessage({
    type: 'success',
    title: 'Rifornimento eliminato',
    message: 'Il record e stato eliminato e i km della targa sono stati ricalcolati.'
  });
  redirect('/fuel');
}
