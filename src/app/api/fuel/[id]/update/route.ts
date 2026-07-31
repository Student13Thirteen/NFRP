import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getFuelActionErrorMessage, updateFuelEntryFromForm } from '@/lib/fuel-import';
import { setFlashMessage } from '@/lib/flash';

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

function redirectWithError(path: string, message: string) {
  const params = new URLSearchParams({ error: message });
  return redirectTo(`${path}?${params.toString()}`);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return redirectTo('/login');

  const { id } = await params;

  try {
    const formData = await request.formData();
    await updateFuelEntryFromForm(id, formData);

    revalidatePath('/fuel');
    revalidatePath(`/fuel/${id}`);
    await setFlashMessage({
      type: 'success',
      title: 'Rifornimento aggiornato',
      message: 'Le modifiche sono state salvate e i km della targa sono stati ricalcolati.'
    });
    return redirectTo(`/fuel/${id}`);
  } catch (error) {
    console.error('Aggiornamento rifornimento fallito.', error);
    return redirectWithError(`/fuel/${id}`, getFuelActionErrorMessage(error));
  }
}
