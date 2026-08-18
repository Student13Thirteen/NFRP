import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createManualFuelEntryFromForm, getFuelActionErrorMessage } from '@/lib/fuel-import';
import { setFlashMessage } from '@/lib/flash';

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

function redirectWithError(path: string, message: string) {
  const params = new URLSearchParams({ error: message });
  return redirectTo(`${path}?${params.toString()}`);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return redirectTo('/login');

  let entry: Awaited<ReturnType<typeof createManualFuelEntryFromForm>>;
  try {
    const formData = await request.formData();
    entry = await createManualFuelEntryFromForm(formData);
  } catch (error) {
    console.error('Creazione rifornimento manuale fallita.', error);
    return redirectWithError('/fuel/new', getFuelActionErrorMessage(error));
  }

  revalidatePath('/fuel');
  await setFlashMessage({
    type: 'success',
    title: 'Rifornimento salvato',
    message: 'Il rifornimento manuale e stato inserito.'
  });
  return redirectTo(`/fuel/${entry.id}`);
}
