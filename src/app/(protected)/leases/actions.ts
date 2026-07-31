'use server';

import { requireUser } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { setFlashMessage } from '@/lib/flash';
import {
  activateLeaseContractFromForm,
  cancelLeaseContract,
  deletePendingLeaseContract
} from '@/lib/lease-form';

const LIST_PATH = '/leases';
const REVIEW_PATH = '/leases/import/review';

function revalidateLeaseViews() {
  revalidatePath(LIST_PATH);
  revalidatePath(REVIEW_PATH);
  revalidatePath('/costs');
  revalidatePath('/acquisitions');
  revalidatePath('/dashboard');
}

function redirectError(path: string, error: unknown): never {
  const message = error instanceof Error ? error.message : 'Operazione leasing non riuscita.';
  redirect(`${path}?${new URLSearchParams({ error: message }).toString()}`);
}

export async function activateLeaseContractAction(contractId: string, formData: FormData) {
  await requireUser();
  try {
    await activateLeaseContractFromForm(contractId, formData);
  } catch (error) {
    console.error('Validazione contratto leasing fallita.', error);
    redirectError(REVIEW_PATH, error);
  }
  revalidateLeaseViews();
  await setFlashMessage({
    type: 'success',
    title: 'Contratto leasing attivato',
    message: 'Il piano canoni è stato creato e compare nel centro costi come impegno previsionale.'
  });
  redirect(`${LIST_PATH}/${contractId}`);
}

export async function deletePendingLeaseContractAction(contractId: string) {
  await requireUser();
  try {
    await deletePendingLeaseContract(contractId);
  } catch (error) {
    console.error('Eliminazione bozza leasing fallita.', error);
    redirectError(REVIEW_PATH, error);
  }
  revalidateLeaseViews();
  redirect(REVIEW_PATH);
}

export async function cancelLeaseContractAction(contractId: string) {
  await requireUser();
  try {
    await cancelLeaseContract(contractId);
  } catch (error) {
    console.error('Annullamento contratto leasing fallito.', error);
    redirectError(`${LIST_PATH}/${contractId}`, error);
  }
  revalidateLeaseViews();
  await setFlashMessage({
    type: 'info',
    title: 'Contratto annullato',
    message: 'I canoni restano nello storico ma non sono più inclusi negli impegni del centro costi.'
  });
  redirect(`${LIST_PATH}/${contractId}`);
}
