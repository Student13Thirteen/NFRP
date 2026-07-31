import { PrismaClient, EntityType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const prisma = new PrismaClient();

const documentTypes = [
  ['Patente', EntityType.DRIVER],
  ['CQC', EntityType.DRIVER],
  ['Carta tachigrafica', EntityType.DRIVER],
  ['ADR', EntityType.DRIVER],
  ['Visita medica', EntityType.DRIVER],
  ['Libretto/Revisione Trattore', EntityType.TRACTOR],
  ['Libretto/Revisione Semirimorchio', EntityType.TRAILER],
  ['Assicurazione Trattore', EntityType.TRACTOR],
  ['Assicurazione Semirimorchio', EntityType.TRAILER],
  ['Barrato rosa Trattore', EntityType.TRACTOR],
  ['Barrato rosa Semirimorchio', EntityType.TRAILER],
  ['Estintori Trattore', EntityType.TRACTOR],
  ['Estintori Semirimorchio', EntityType.TRAILER],
  ['Revisione cronotachigrafo', EntityType.TRACTOR],
  ['Metrica carburanti', EntityType.OTHER],
  ['Permesso porto', EntityType.OTHER],
  ['Altro', EntityType.OTHER]
] as const;

function shouldSeedDemoData() {
  return ['true', '1', 'yes', 'on'].includes((process.env.SEED_DEMO_DATA || '').toLowerCase());
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() || 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'change-this-password';

  if (adminPassword.length < 10) {
    console.warn('ADMIN_PASSWORD should be at least 10 characters long.');
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash
    },
    create: {
      email: adminEmail,
      passwordHash
    }
  });

  for (const [name, suggestedEntityType] of documentTypes) {
    await prisma.documentType.upsert({
      where: { name },
      update: {},
      create: {
        name,
        suggestedEntityType,
        defaultNoticeDays: Number(process.env.DEFAULT_NOTICE_DAYS || 30)
      }
    });
  }

  if (!shouldSeedDemoData()) {
    console.log('Demo data disabled. Set SEED_DEMO_DATA=true to create sample registry records.');
  } else {
    await prisma.driver.upsert({
      where: { id: 'seed-driver-1' },
      update: {},
      create: {
        id: 'seed-driver-1',
        firstName: 'Mario',
        lastName: 'Rossi',
        phone: '+39 333 0000001',
        email: 'mario.rossi@example.com',
        notes: 'Dato dimostrativo'
      }
    });

    await prisma.driver.upsert({
      where: { id: 'seed-driver-2' },
      update: {},
      create: {
        id: 'seed-driver-2',
        firstName: 'Luca',
        lastName: 'Bianchi',
        phone: '+39 333 0000002',
        notes: 'Dato dimostrativo'
      }
    });

    await prisma.tractor.upsert({
      where: { plate: 'AB123CD' },
      update: {},
      create: {
        plate: 'AB123CD',
        brand: 'Volvo',
        model: 'FH',
        notes: 'Dato dimostrativo'
      }
    });

    await prisma.trailer.upsert({
      where: { plate: 'TR456EF' },
      update: {},
      create: {
        plate: 'TR456EF',
        brand: 'Schmitz',
        model: 'Container',
        notes: 'Dato dimostrativo'
      }
    });

    await prisma.otherEntity.upsert({
      where: { id: 'seed-other-1' },
      update: {},
      create: {
        id: 'seed-other-1',
        name: 'Porto di esempio',
        category: 'Porto',
        notes: 'Dato dimostrativo'
      }
    });
  }

  const brandingDefaults = [
    ['brand_company_name', process.env.BRAND_COMPANY_NAME || 'Demo Logistics S.r.l.'],
    ['brand_product_name', process.env.BRAND_PRODUCT_NAME || 'NFRP'],
    ['brand_subtitle', process.env.BRAND_SUBTITLE || 'Operations Platform'],
    ['brand_primary_color', process.env.BRAND_PRIMARY_COLOR || '#1f6feb'],
    ['brand_primary_dark_color', process.env.BRAND_PRIMARY_DARK_COLOR || '#185abc'],
    ['brand_sidebar_color', process.env.BRAND_SIDEBAR_COLOR || '#182230'],
    ['brand_accent_color', process.env.BRAND_ACCENT_COLOR || '#1d7f4f']
  ] as const;

  for (const [key, value] of brandingDefaults) {
    await prisma.appSetting.upsert({
      where: { key },
      update: {},
      create: { key, value }
    });
  }

  const bootstrapLogo = process.env.BRAND_LOGO_SOURCE?.trim();
  if (bootstrapLogo) {
    const existingLogo = await prisma.appSetting.findUnique({ where: { key: 'brand_logo_file' } });
    if (!existingLogo) {
      try {
        await stat(bootstrapLogo);
        const extension = path.extname(bootstrapLogo).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) {
          const normalizedExtension = extension === '.jpeg' ? '.jpg' : extension;
          const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
          const brandingDir = path.join(uploadDir, 'branding');
          await mkdir(brandingDir, { recursive: true });
          const target = path.join(brandingDir, `company-logo${normalizedExtension}`);
          await copyFile(bootstrapLogo, target);
          await prisma.appSetting.create({
            data: { key: 'brand_logo_file', value: path.posix.join('branding', `company-logo${normalizedExtension}`) }
          });
        }
      } catch (error) {
        console.warn('Bootstrap logo not imported.', error instanceof Error ? error.message : error);
      }
    }
  }

  await prisma.appSetting.upsert({
    where: { key: 'default_notice_days' },
    update: { value: String(process.env.DEFAULT_NOTICE_DAYS || 30) },
    create: { key: 'default_notice_days', value: String(process.env.DEFAULT_NOTICE_DAYS || 30) }
  });

  await prisma.appSetting.upsert({
    where: { key: 'telegram_enabled' },
    update: { value: String(process.env.TELEGRAM_NOTIFICATIONS_ENABLED ?? 'true') },
    create: { key: 'telegram_enabled', value: String(process.env.TELEGRAM_NOTIFICATIONS_ENABLED ?? 'true') }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
