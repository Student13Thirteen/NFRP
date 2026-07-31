import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createMaintenanceFromForm, getMaintenanceActionErrorMessage } from '@/lib/maintenance-form';
import { setFlashMessage } from '@/lib/flash';

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

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return redirectTo('/login');

  try {
    const formData = await request.formData();
    const maintenance = await createMaintenanceFromForm(formData);

    revalidatePath('/maintenances');
    await setFlashMessage({
      type: 'success',
      title: 'Manutenzione salvata',
      message: 'La manutenzione e stata inserita correttamente.'
    });
    return redirectTo(`/maintenances/${maintenance.id}`);
  } catch (error) {
    logMaintenanceError('Creazione manutenzione fallita.', error);
    return redirectWithError('/maintenances/new', getMaintenanceActionErrorMessage(error));
  }
}
