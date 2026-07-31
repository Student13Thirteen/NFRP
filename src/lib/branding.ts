import 'server-only';

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { getOptionalEnv, getUploadDir } from '@/lib/env';
import type { BrandingConfig } from '@/lib/branding-types';

export const BRANDING_KEYS = {
  companyName: 'brand_company_name',
  productName: 'brand_product_name',
  subtitle: 'brand_subtitle',
  primaryColor: 'brand_primary_color',
  primaryDarkColor: 'brand_primary_dark_color',
  sidebarColor: 'brand_sidebar_color',
  accentColor: 'brand_accent_color',
  logoFile: 'brand_logo_file'
} as const;

const DEFAULTS = {
  companyName: getOptionalEnv('BRAND_COMPANY_NAME', 'Demo Logistics S.r.l.'),
  productName: getOptionalEnv('BRAND_PRODUCT_NAME', 'NFRP'),
  subtitle: getOptionalEnv('BRAND_SUBTITLE', 'Operations Platform'),
  primaryColor: normalizeHexColor(getOptionalEnv('BRAND_PRIMARY_COLOR', '#1f6feb'), '#1f6feb'),
  primaryDarkColor: normalizeHexColor(getOptionalEnv('BRAND_PRIMARY_DARK_COLOR', '#185abc'), '#185abc'),
  sidebarColor: normalizeHexColor(getOptionalEnv('BRAND_SIDEBAR_COLOR', '#182230'), '#182230'),
  accentColor: normalizeHexColor(getOptionalEnv('BRAND_ACCENT_COLOR', '#1d7f4f'), '#1d7f4f')
};

export function normalizeHexColor(value: string, fallback: string): string {
  const candidate = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate.toLowerCase() : fallback;
}

export function getDefaultBranding(): BrandingConfig {
  return {
    ...DEFAULTS,
    logoUrl: null,
    updatedAt: null
  };
}

export async function getBranding(): Promise<BrandingConfig> {
  try {
    const settings = await prisma.appSetting.findMany({
      where: { key: { in: Object.values(BRANDING_KEYS) } }
    });
    const values = new Map(settings.map((setting) => [setting.key, setting.value]));
    const latest = settings.reduce<Date | null>((current, setting) => {
      return !current || setting.updatedAt > current ? setting.updatedAt : current;
    }, null);
    const logoFile = values.get(BRANDING_KEYS.logoFile)?.trim();

    return {
      companyName: values.get(BRANDING_KEYS.companyName)?.trim() || DEFAULTS.companyName,
      productName: values.get(BRANDING_KEYS.productName)?.trim() || DEFAULTS.productName,
      subtitle: values.get(BRANDING_KEYS.subtitle)?.trim() || DEFAULTS.subtitle,
      primaryColor: normalizeHexColor(values.get(BRANDING_KEYS.primaryColor) || '', DEFAULTS.primaryColor),
      primaryDarkColor: normalizeHexColor(values.get(BRANDING_KEYS.primaryDarkColor) || '', DEFAULTS.primaryDarkColor),
      sidebarColor: normalizeHexColor(values.get(BRANDING_KEYS.sidebarColor) || '', DEFAULTS.sidebarColor),
      accentColor: normalizeHexColor(values.get(BRANDING_KEYS.accentColor) || '', DEFAULTS.accentColor),
      logoUrl: logoFile ? `/api/branding/logo?v=${latest?.getTime() || 0}` : null,
      updatedAt: latest?.toISOString() || null
    };
  } catch (error) {
    console.warn('Branding settings unavailable; using safe defaults.', error instanceof Error ? error.message : error);
    return getDefaultBranding();
  }
}

export async function saveBrandingValues(input: Omit<BrandingConfig, 'logoUrl' | 'updatedAt'>): Promise<void> {
  const entries = [
    [BRANDING_KEYS.companyName, input.companyName.trim()],
    [BRANDING_KEYS.productName, input.productName.trim()],
    [BRANDING_KEYS.subtitle, input.subtitle.trim()],
    [BRANDING_KEYS.primaryColor, normalizeHexColor(input.primaryColor, DEFAULTS.primaryColor)],
    [BRANDING_KEYS.primaryDarkColor, normalizeHexColor(input.primaryDarkColor, DEFAULTS.primaryDarkColor)],
    [BRANDING_KEYS.sidebarColor, normalizeHexColor(input.sidebarColor, DEFAULTS.sidebarColor)],
    [BRANDING_KEYS.accentColor, normalizeHexColor(input.accentColor, DEFAULTS.accentColor)]
  ] as const;

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.appSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value }
      })
    )
  );
}

const ALLOWED_LOGO_TYPES = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp']
]);

function hasExpectedImageSignature(buffer: Buffer, extension: string): boolean {
  if (extension === '.png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (extension === '.jpg') return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
  if (extension === '.webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

export async function storeBrandLogo(file: File): Promise<string> {
  const extension = ALLOWED_LOGO_TYPES.get(file.type);
  if (!extension) throw new Error('Logo non valido. Usa PNG, JPG o WebP.');
  if (file.size <= 0 || file.size > 2 * 1024 * 1024) throw new Error('Il logo deve pesare al massimo 2 MB.');

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!hasExpectedImageSignature(buffer, extension)) throw new Error('Il contenuto del logo non corrisponde al formato dichiarato.');

  const brandingDir = path.join(getUploadDir(), 'branding');
  await mkdir(brandingDir, { recursive: true });
  await Promise.all(['.png', '.jpg', '.webp'].map((candidate) => rm(path.join(brandingDir, `company-logo${candidate}`), { force: true })));
  const relativePath = path.posix.join('branding', `company-logo${extension}`);
  await writeFile(path.join(getUploadDir(), relativePath), buffer, { flag: 'wx' });

  await prisma.appSetting.upsert({
    where: { key: BRANDING_KEYS.logoFile },
    update: { value: relativePath },
    create: { key: BRANDING_KEYS.logoFile, value: relativePath }
  });
  return relativePath;
}

export async function removeBrandLogo(): Promise<void> {
  const setting = await prisma.appSetting.findUnique({ where: { key: BRANDING_KEYS.logoFile } });
  if (setting?.value) {
    const uploadRoot = path.resolve(getUploadDir());
    const absolutePath = path.resolve(uploadRoot, setting.value);
    if (absolutePath.startsWith(uploadRoot + path.sep)) await rm(absolutePath, { force: true });
  }
  await prisma.appSetting.deleteMany({ where: { key: BRANDING_KEYS.logoFile } });
}

export async function readBrandLogo(): Promise<{ buffer: Buffer; contentType: string } | null> {
  const setting = await prisma.appSetting.findUnique({ where: { key: BRANDING_KEYS.logoFile } });
  if (!setting?.value) return null;

  const uploadRoot = path.resolve(getUploadDir());
  const absolutePath = path.resolve(uploadRoot, setting.value);
  if (!absolutePath.startsWith(uploadRoot + path.sep)) return null;

  const extension = path.extname(absolutePath).toLowerCase();
  const contentType = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg';
  try {
    return { buffer: await readFile(absolutePath), contentType };
  } catch {
    return null;
  }
}
