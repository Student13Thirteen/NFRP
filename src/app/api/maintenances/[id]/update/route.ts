import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getMaintenanceActionErrorMessage, updateMaintenanceFromForm } from '@/lib/maintenance-form';
import { setFlashMessage } from '@/lib/flash';

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

function logMaintenanceError(message: string, error: unknown) {
  console.error(message, error instanceof Error ? { message: error.message, stack: error.stack } : { error });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return redirectTo('/login');

  const { id } = await params;

  try {
    const formData = await request.formData();
    await updateMaintenanceFromForm(id, formData);
  } catch (error) {
    logMaintenanceError('Aggiornamento manutenzione fallito.', error);
    return redirectWithError(`/maintenances/${id}`, getMaintenanceActionErrorMessage(error));
  }

  revalidatePath('/maintenances');
  revalidatePath(`/maintenances/${id}`);
  await setFlashMessage({
    type: 'success',
    title: 'Manutenzione aggiornata',
    message: 'Le modifiche sono state salvate correttamente.'
  });
  return redirectTo(`/maintenances/${id}`);
}
