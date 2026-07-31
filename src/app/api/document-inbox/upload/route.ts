import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createInboxItemsFromFiles, ensureInboxQueueStarted } from '@/lib/document-inbox';
import { getDocumentFormErrorMessage, logDocumentFormError } from '@/lib/document-form';
import { setFlashMessage } from '@/lib/flash';

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

function redirectWithError(path: string, message: string) {
  const params = new URLSearchParams({ error: message });
  return redirectTo(`${path}?${params.toString()}`);
}

export async function POST(request: NextRequest) {
  // La form usa XHR (barra di avanzamento) e si aspetta JSON; senza JS resta il classico POST con redirect.
  const wantsJson = request.headers.get('accept')?.includes('application/json') ?? false;
  const user = await getCurrentUser();
  if (!user) {
    return wantsJson ? NextResponse.json({ error: 'Sessione scaduta.' }, { status: 401 }) : redirectTo('/login');
  }

  try {
    await ensureInboxQueueStarted();

    const formData = await request.formData();
    const files = formData
      .getAll('files')
      .filter((file): file is File => file instanceof File && file.size > 0 && Boolean(file.name));
    const splitEveryPage = ['1', 'true', 'on'].includes(String(formData.get('splitPages') || '').toLowerCase());

    if (files.length === 0) throw new Error('Seleziona almeno un PDF da caricare.');

    const result = await createInboxItemsFromFiles(files, { splitEveryPage });
    const created = result.items;
    revalidatePath('/documents/inbox');

    const duplicates = result.duplicateItems;

    if (wantsJson) {
      return NextResponse.json({
        created: created.map((item) => item.id),
        duplicates,
        sourceFiles: result.sourceFiles,
        expandedPages: result.expandedPages
      });
    }

    if (created.length === 0) {
      await setFlashMessage({
        type: 'info',
        title: 'PDF già in inbox',
        message: 'Questo PDF risulta già in attesa nella inbox: non è stato aggiunto un doppione.'
      });
    } else {
      await setFlashMessage({
        type: 'success',
        title: created.length === 1 ? 'PDF caricato in inbox' : 'PDF caricati in inbox',
        message:
          result.expandedPages > result.sourceFiles
            ? `${result.sourceFiles} PDF combinati separati in ${result.expandedPages} PDF autonomi; ${created.length} sono ora in analisi automatica.`
            : created.length === 1
            ? 'Analisi automatica avviata: i dati riconosciuti compaiono tra pochi secondi.'
            : `${created.length} PDF in analisi automatica: i dati riconosciuti compaiono tra pochi secondi.`
      });
    }

    return redirectTo('/documents/inbox');
  } catch (error) {
    logDocumentFormError('Upload inbox fallito.', error);
    const message = getDocumentFormErrorMessage(error);
    return wantsJson
      ? NextResponse.json({ error: message }, { status: 400 })
      : redirectWithError('/documents/inbox', message);
  }
}
