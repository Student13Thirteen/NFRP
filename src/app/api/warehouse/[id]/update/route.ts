import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { setFlashMessage } from '@/lib/flash';
import { getWarehouseActionErrorMessage, updateWarehouseItemFromForm } from '@/lib/warehouse-form';

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

export async function POST(request: NextRequest, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return redirectTo('/login');

  const { id } = await params;

  try {
    const formData = await request.formData();
    await updateWarehouseItemFromForm(id, formData);
  } catch (error) {
    logWarehouseError('Aggiornamento record magazzino fallito.', error);
    return redirectWithError(`/warehouse/${id}`, getWarehouseActionErrorMessage(error));
  }

  revalidatePath('/warehouse');
  revalidatePath(`/warehouse/${id}`);
  await setFlashMessage({
    type: 'success',
    title: 'Record magazzino aggiornato',
    message: 'Le modifiche sono state salvate correttamente.'
  });
  return redirectTo(`/warehouse/${id}`);
}
