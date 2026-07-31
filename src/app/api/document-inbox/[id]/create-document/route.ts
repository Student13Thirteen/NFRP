import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createDocumentFromInboxItem } from '@/lib/document-inbox';
import { getDocumentFormErrorMessage, logDocumentFormError } from '@/lib/document-form';
import { setFlashMessage } from '@/lib/flash';

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

function redirectWithError(id: string, message: string) {
  const params = new URLSearchParams({ error: message });
  return redirectTo(`/documents/inbox/${id}?${params.toString()}`);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return redirectTo('/login');

  const { id } = await params;

  try {
    const formData = await request.formData();
    const document = await createDocumentFromInboxItem(id, formData);

    revalidatePath('/documents/inbox');
    revalidatePath('/documents');
    revalidatePath('/documents/history');
    revalidatePath('/documents/disposed');
    revalidatePath('/dashboard');
    if (document.renewedFromId) revalidatePath(`/documents/${document.renewedFromId}`);
    await setFlashMessage({
      type: 'success',
      title: 'Documento importato',
      message: 'Il PDF inbox e stato trasformato in documento archiviato.'
    });
    return redirectTo(`/documents/${document.id}`);
  } catch (error) {
    logDocumentFormError('Import inbox fallito.', error);
    return redirectWithError(id, getDocumentFormErrorMessage(error));
  }
}
