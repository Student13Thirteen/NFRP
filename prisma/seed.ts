import { EntityType, MotorVehicleType, PrismaClient, TrailerBodyType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const prisma = new PrismaClient();

const documentTypes = [
  ['Patente', EntityType.DRIVER, true],
  ['CQC', EntityType.DRIVER, true],
  ['Carta tachigrafica', EntityType.DRIVER, true],
  ['ADR', EntityType.DRIVER, true],
  ['Visita medica', EntityType.DRIVER, true],
  ['Badge portuale', EntityType.DRIVER, true],
  ['Libretto/Revisione Trattore', EntityType.TRACTOR, true],
  ['Libretto/Revisione Semirimorchio', EntityType.TRAILER, true],
  ['Assicurazione Trattore', EntityType.TRACTOR, true],
  ['Assicurazione Semirimorchio', EntityType.TRAILER, true],
  ['Barrato rosa Trattore', EntityType.TRACTOR, true],
  ['Barrato rosa Semirimorchio', EntityType.TRAILER, true],
  ['Estintori Trattore', EntityType.TRACTOR, true],
  ['Estintori Semirimorchio', EntityType.TRAILER, true],
  ['Revisione cronotachigrafo', EntityType.TRACTOR, true],
  ['Aggiornamento tachigrafo digitale', EntityType.TRACTOR, false],
  ['Metrica carburanti', EntityType.OTHER, true],
  ['Permesso porto', EntityType.OTHER, true],
  ['Altro', EntityType.OTHER, true]
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

  for (const [name, suggestedEntityType, expiryRequired] of documentTypes) {
    await prisma.documentType.upsert({
      where: { name },
      update: {
        suggestedEntityType,
        expiryRequired,
        active: true
      },
      create: {
        name,
        suggestedEntityType,
        defaultNoticeDays: Number(process.env.DEFAULT_NOTICE_DAYS || 30),
        expiryRequired
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

    const seedTractor = await prisma.tractor.upsert({
      where: { plate: 'AB123CD' },
      update: { vehicleType: MotorVehicleType.TRACTOR_UNIT },
      create: {
        plate: 'AB123CD',
        vehicleType: MotorVehicleType.TRACTOR_UNIT,
        brand: 'Volvo',
        model: 'FH',
        notes: 'Dato dimostrativo'
      }
    });

    await prisma.driverEmploymentPeriod.upsert({
      where: { id: 'seed-employment-1' },
      update: {},
      create: {
        id: 'seed-employment-1',
        driverId: 'seed-driver-1',
        startDate: new Date('2024-01-15'),
        notes: 'Rapporto di lavoro dimostrativo'
      }
    });

    await prisma.driverEmploymentPeriod.upsert({
      where: { id: 'seed-employment-2' },
      update: {},
      create: {
        id: 'seed-employment-2',
        driverId: 'seed-driver-2',
        startDate: new Date('2023-03-01'),
        endDate: new Date('2025-12-31'),
        endReason: 'CONTRACT_ENDED',
        notes: 'Periodo concluso dimostrativo'
      }
    });

    await prisma.tractorDriverAssignment.upsert({
      where: { id: 'seed-assignment-1' },
      update: {},
      create: {
        id: 'seed-assignment-1',
        tractorId: seedTractor.id,
        driverId: 'seed-driver-1',
        validFrom: new Date('2025-01-01'),
        notes: 'Assegnazione dimostrativa'
      }
    });

    await prisma.trailer.upsert({
      where: { plate: 'TR456EF' },
      update: { bodyType: TrailerBodyType.CONTAINER, tankCargo: null },
      create: {
        plate: 'TR456EF',
        bodyType: TrailerBodyType.CONTAINER,
        brand: 'Schmitz',
        model: 'Container',
        notes: 'Dato dimostrativo'
      }
    });

    await prisma.vehicleOwner.upsert({
      where: { name: 'Trasporti Demo Partner S.r.l.' },
      update: { active: true },
      create: {
        name: 'Trasporti Demo Partner S.r.l.',
        vatNumber: '01122334455',
        phone: '+39 02 0000000',
        notes: 'Proprietario di mezzi terzi esclusivamente dimostrativo'
      }
    });

    await prisma.roadFine.upsert({
      where: { id: 'seed-road-fine-1' },
      update: {},
      create: {
        id: 'seed-road-fine-1',
        status: 'TO_PAY',
        responsibility: 'COMPANY',
        noticeNumber: 'DEMO-VERBALE-001',
        authority: 'Polizia Locale Demo',
        violationDate: new Date('2026-08-05'),
        notificationDate: new Date('2026-08-12'),
        location: 'Via Esempio 20, Milano',
        violationCode: 'DEMO',
        description: 'Verbale esclusivamente dimostrativo',
        tractorId: seedTractor.id,
        driverId: 'seed-driver-1',
        reducedAmountCents: 8700,
        paymentDueDate: new Date('2026-09-10'),
        notes: 'Nessun riferimento a persone, aziende o fatti reali'
      }
    });

    await prisma.roadAccident.upsert({
      where: { id: 'seed-road-accident-1' },
      update: {},
      create: {
        id: 'seed-road-accident-1',
        status: 'CLAIM_OPEN',
        responsibility: 'TO_ASSESS',
        accidentDate: new Date('2026-08-08'),
        location: 'Area logistica dimostrativa',
        description: 'Sinistro esclusivamente dimostrativo, senza persone coinvolte',
        tractorId: seedTractor.id,
        driverId: 'seed-driver-1',
        insurerName: 'Assicurazioni Demo S.p.A.',
        policyNumber: 'POL-DEMO-001',
        claimNumber: 'SIN-DEMO-001',
        reportedDate: new Date('2026-08-09'),
        nextDeadline: new Date('2026-09-15'),
        estimatedDamageCents: 150000,
        directCostCents: 30000,
        directCostDate: new Date('2026-08-10'),
        notes: 'Nessun riferimento a persone, aziende o fatti reali'
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

    await prisma.customer.upsert({
      where: { code: 'CLI-DEMO-001' },
      update: {},
      create: {
        code: 'CLI-DEMO-001',
        name: 'Cliente Demo S.r.l.',
        vatNumber: '01234567890',
        pecEmail: 'cliente-demo@pec.example',
        address: 'Via Esempio 10',
        postalCode: '20100',
        city: 'Milano',
        province: 'MI',
        country: 'Italia',
        notes: 'Anagrafica esclusivamente dimostrativa'
      }
    });

    await prisma.supplier.upsert({
      where: { name: 'Officina Demo S.r.l.' },
      update: {},
      create: {
        name: 'Officina Demo S.r.l.',
        vatNumber: '09876543210',
        email: 'amministrazione@officina-demo.example',
        city: 'Bologna',
        province: 'BO',
        country: 'Italia',
        notes: 'Fornitore esclusivamente dimostrativo'
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

  await prisma.category.upsert({
    where: { name: 'Lavaggio' },
    update: { active: true },
    create: {
      name: 'Lavaggio',
      notes: 'Lavaggio esterno, interno, cisterna o sanificazione del mezzo.'
    }
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
