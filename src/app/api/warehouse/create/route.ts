import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { setFlashMessage } from '@/lib/flash';
import { createWarehouseItemFromForm, getWarehouseActionErrorMessage } from '@/lib/warehouse-form';

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

function redirectWithError(path: string, message: string) {
  const params = new URLSearchParams({ error: message });
  return redirectTo(`${path}?${params.toString()}`);
}

function logWarehouseError(message: string, error: unknown) {
  console.error(message, error instanceof Error ? { message: error.message, stack: error.stack } : { error });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return redirectTo('/login');

  try {
    const formData = await request.formData();
    const item = await createWarehouseItemFromForm(formData);

    revalidatePath('/warehouse');
    await setFlashMessage({
      type: 'success',
      title: 'Record magazzino salvato',
      message: 'Il materiale e stato inserito correttamente.'
    });
    return redirectTo(`/warehouse/${item.id}`);
  } catch (error) {
    logWarehouseError('Creazione record magazzino fallita.', error);
    return redirectWithError('/warehouse/new', getWarehouseActionErrorMessage(error));
  }
}
