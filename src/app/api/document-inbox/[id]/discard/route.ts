import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { discardInboxItem } from '@/lib/document-inbox';
import { getDocumentFormErrorMessage, logDocumentFormError } from '@/lib/document-form';
import { setFlashMessage } from '@/lib/flash';

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

function redirectWithError(message: string) {
  const params = new URLSearchParams({ error: message });
  return redirectTo(`/documents/inbox?${params.toString()}`);
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return redirectTo('/login');

  const { id } = await params;

  try {
    await discardInboxItem(id);
    revalidatePath('/documents/inbox');
    await setFlashMessage({
      type: 'info',
      title: 'PDF eliminato',
      message: 'Il file e stato rimosso definitivamente dalla inbox.'
    });
    return redirectTo('/documents/inbox');
  } catch (error) {
    logDocumentFormError('Scarto inbox fallito.', error);
    return redirectWithError(getDocumentFormErrorMessage(error));
  }
}
