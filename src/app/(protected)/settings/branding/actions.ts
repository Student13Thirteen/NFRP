'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { normalizeHexColor, removeBrandLogo, saveBrandingValues, storeBrandLogo } from '@/lib/branding';
import { setFlashMessage } from '@/lib/flash';

const brandingSchema = z.object({
  companyName: z.string().trim().min(2, 'Nome azienda richiesto').max(120),
  productName: z.string().trim().min(2).max(40),
  subtitle: z.string().trim().min(2).max(80),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  primaryDarkColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sidebarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/)
});

export async function updateBrandingAction(formData: FormData) {
  await requireUser();
  const parsed = brandingSchema.parse({
    companyName: formData.get('companyName'),
    productName: formData.get('productName'),
    subtitle: formData.get('subtitle'),
    primaryColor: formData.get('primaryColor'),
    primaryDarkColor: formData.get('primaryDarkColor'),
    sidebarColor: formData.get('sidebarColor'),
    accentColor: formData.get('accentColor')
  });

  await saveBrandingValues({
    ...parsed,
    primaryColor: normalizeHexColor(parsed.primaryColor, '#1f6feb'),
    primaryDarkColor: normalizeHexColor(parsed.primaryDarkColor, '#185abc'),
    sidebarColor: normalizeHexColor(parsed.sidebarColor, '#182230'),
    accentColor: normalizeHexColor(parsed.accentColor, '#1d7f4f')
  });

  const logo = formData.get('logo');
  if (logo instanceof File && logo.size > 0) await storeBrandLogo(logo);
  if (formData.get('removeLogo') === 'on') await removeBrandLogo();

  revalidatePath('/', 'layout');
  await setFlashMessage({
    type: 'success',
    title: 'Identità aziendale aggiornata',
    message: 'Nome, logo e palette sono stati applicati all’interfaccia.'
  });
}
