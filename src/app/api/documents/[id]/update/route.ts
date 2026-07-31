import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDocumentFormErrorMessage, logDocumentFormError, updateDocumentFromForm } from '@/lib/document-form';
import { setFlashMessage } from '@/lib/flash';

type RouteContext = {
  params: Promise<{ id: string }>;
};

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

function redirectWithError(request: NextRequest, path: string, message: string) {
  const params = new URLSearchParams({ error: message });
  return redirectTo(`${path}?${params.toString()}`);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return redirectTo('/login');

  const { id } = await params;

  try {
    const formData = await request.formData();
    await updateDocumentFromForm(id, formData);

    revalidatePath('/documents');
    revalidatePath('/documents/history');
    revalidatePath('/dashboard');
    revalidatePath(`/documents/${id}`);
    await setFlashMessage({
      type: 'success',
      title: 'Modifiche salvate',
      message: 'Il documento e stato aggiornato correttamente.'
    });
    return redirectTo(`/documents/${id}`);
  } catch (error) {
    logDocumentFormError('Aggiornamento documento fallito.', error);
    return redirectWithError(request, `/documents/${id}`, getDocumentFormErrorMessage(error));
  }
}
