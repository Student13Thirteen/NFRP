import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDocumentFormErrorMessage, logDocumentFormError, renewDocumentFromForm } from '@/lib/document-form';
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
    const newDocument = await renewDocumentFromForm(id, formData);

    revalidatePath('/documents');
    revalidatePath('/documents/history');
    revalidatePath('/dashboard');
    revalidatePath(`/documents/${id}`);
    await setFlashMessage({
      type: 'success',
      title: 'Documento rinnovato',
      message: 'Il rinnovo e stato registrato correttamente.'
    });
    return redirectTo(`/documents/${newDocument.id}`);
  } catch (error) {
    logDocumentFormError('Rinnovo documento fallito.', error);
    return redirectWithError(request, `/documents/${id}`, getDocumentFormErrorMessage(error));
  }
}
