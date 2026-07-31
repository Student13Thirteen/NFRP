import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { setFlashMessage } from '@/lib/flash';
import { importLeasePdfFiles } from '@/lib/lease-import';

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return redirectTo('/login');

  try {
    const formData = await request.formData();
    const files = formData.getAll('files').filter((file): file is File => file instanceof File && file.size > 0);
    if (files.length === 0) return redirectTo('/leases/import?error=Nessun+PDF+selezionato.');

    const result = await importLeasePdfFiles(files);
    revalidatePath('/leases');
    revalidatePath('/leases/import/review');
    revalidatePath('/maintenances/expenses/review');
    revalidatePath('/acquisitions');

    await setFlashMessage({
      type: 'info',
      title: 'PDF leasing analizzati',
      message: `${result.importedContracts} contratti e ${result.importedInvoices} fatture preparati per il controllo. ${result.duplicateDocuments} duplicati ignorati.`
    });

    if (result.importedContracts > 0) return redirectTo('/leases/import/review');
    if (result.importedInvoices > 0) return redirectTo('/maintenances/expenses/review');
    const error = result.errors[0] || 'Nessun nuovo documento da importare.';
    return redirectTo(`/leases/import?${new URLSearchParams({ error }).toString()}`);
  } catch (error) {
    console.error('Import leasing fallito.', error);
    const message = error instanceof Error ? error.message : 'Import leasing non riuscito.';
    return redirectTo(`/leases/import?${new URLSearchParams({ error: message }).toString()}`);
  }
}
