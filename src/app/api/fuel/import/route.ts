import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getFuelActionErrorMessage, importFuelPdfFiles } from '@/lib/fuel-import';
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

  try {
    const formData = await request.formData();
    const files = formData.getAll('files').filter((file): file is File => file instanceof File && file.size > 0);
    const result = await importFuelPdfFiles(files);

    revalidatePath('/fuel');
    revalidatePath('/fuel/settings');
    revalidatePath('/vehicles/tractors');
    revalidatePath('/fuel/import/review');
    const tractorNote =
      result.createdTractors > 0 ? ` ${result.createdTractors} nuove targhe aggiunte in anagrafica trattori.` : '';
    await setFlashMessage({
      type: 'info',
      title: 'Import rifornimenti completato',
      message: `${result.importedRows} righe in attesa di conferma, ${result.duplicateRows} gia presenti.${tractorNote} Controllale e conferma o elimina.`
    });

    return redirectTo(result.importedRows > 0 ? '/fuel/import/review' : '/fuel');
  } catch (error) {
    console.error('Import rifornimenti fallito.', error);
    return redirectWithError('/fuel/import', getFuelActionErrorMessage(error));
  }
}
