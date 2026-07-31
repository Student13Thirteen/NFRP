import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createInboxItemFromFile } from '@/lib/document-inbox';
import { getDocumentFormErrorMessage, logDocumentFormError } from '@/lib/document-form';
import { documentCanBeRenewalSource } from '@/lib/documents';
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

export async function POST(request: NextRequest, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return redirectTo('/login');

  const { id } = await params;

  try {
    const document = await prisma.document.findUnique({
      where: { id },
      select: { id: true, status: true }
    });
    if (!document) throw new Error('Documento da rinnovare non trovato.');
    if (!documentCanBeRenewalSource(document)) {
      throw new Error('Questo documento e gia nello storico e non puo essere sostituito.');
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File) || file.size <= 0 || !file.name) {
      throw new Error('Seleziona il PDF del nuovo documento.');
    }

    const item = await createInboxItemFromFile(file);
    revalidatePath('/documents/inbox');
    await setFlashMessage({
      type: 'success',
      title: 'PDF analizzato',
      message: 'Controlla i dati letti automaticamente e conferma la sostituzione del vecchio documento.'
    });
    return redirectTo(`/documents/inbox/${item.id}?replaceDocumentId=${id}`);
  } catch (error) {
    logDocumentFormError('Rinnovo da inbox fallito.', error);
    return redirectWithError(`/documents/${id}`, getDocumentFormErrorMessage(error));
  }
}
