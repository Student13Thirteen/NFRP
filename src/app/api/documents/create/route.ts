import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createDocumentFromForm, getDocumentFormErrorMessage, logDocumentFormError } from '@/lib/document-form';
import { setFlashMessage } from '@/lib/flash';

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

function redirectWithError(request: NextRequest, path: string, message: string) {
  const params = new URLSearchParams({ error: message });
  return redirectTo(`${path}?${params.toString()}`);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return redirectTo('/login');

  try {
    const formData = await request.formData();
    const document = await createDocumentFromForm(formData);

    revalidatePath('/documents');
    revalidatePath('/documents/history');
    revalidatePath('/documents/disposed');
    revalidatePath('/dashboard');
    await setFlashMessage({
      type: 'success',
      title: 'Documento salvato',
      message: 'Il nuovo documento e stato inserito correttamente.'
    });
    return redirectTo(`/documents/${document.id}`);
  } catch (error) {
    logDocumentFormError('Creazione documento fallita.', error);
    return redirectWithError(request, '/documents/new', getDocumentFormErrorMessage(error));
  }
}
