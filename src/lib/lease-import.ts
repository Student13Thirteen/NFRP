import 'server-only';

import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { prisma } from '@/lib/db';
import { sumDocumentTotals } from '@/lib/expense';
import { removeStoredPdf, storePdfBuffer } from '@/lib/files';
import { readPdfTextWithOcr } from '@/lib/inbox-ocr';
import { parseLeaseDocument, type ParsedLeaseContract, type ParsedLeaseInvoice } from '@/lib/lease-parser';

export type LeaseImportResult = {
  importedContracts: number;
  importedInvoices: number;
  duplicateDocuments: number;
  lastContractId: string | null;
  lastInvoiceId: string | null;
  errors: string[];
};

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message.slice(0, 300) : 'Import leasing non riuscito.';
}

function normalizeKeyPart(value: string): string {
  return value
    .toLocaleUpperCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeText(value: string): string {
  return value
    .toLocaleUpperCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Z0-9]+/g, '');
}

async function extractLeaseText(buffer: Buffer): Promise<{ text: string; status: string }> {
  try {
    const result = await pdfParse(buffer);
    const text = result.text
      .replace(/\u0000/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (text.length >= 80) {
      return { text, status: `Testo PDF letto automaticamente (${text.length} caratteri).` };
    }
  } catch {
    // Il fallback OCR produce comunque una proposta revisionabile.
  }

  const ocr = await readPdfTextWithOcr(buffer);
  return { text: ocr.text, status: ocr.status };
}

async function ensureSupplierId(name: string | null): Promise<string | null> {
  if (!name) return null;
  const existing = await prisma.supplier.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true }
  });
  if (existing) return existing.id;
  const created = await prisma.supplier.create({
    data: { name, notes: 'Aggiunto automaticamente durante import leasing.' },
    select: { id: true }
  });
  return created.id;
}

async function ensureLeasingCategoryId(): Promise<string> {
  const existing = await prisma.category.findFirst({
    where: { name: { equals: 'Leasing', mode: 'insensitive' } },
    select: { id: true, active: true }
  });
  if (existing) {
    if (!existing.active) await prisma.category.update({ where: { id: existing.id }, data: { active: true } });
    return existing.id;
  }
  const created = await prisma.category.create({
    data: { name: 'Leasing', notes: 'Canoni e costi effettivi dei contratti di leasing.' },
    select: { id: true }
  });
  return created.id;
}

async function resolveVehicle(plate: string | null): Promise<{
  allocationType: 'TRACTOR' | 'TRAILER' | 'GENERIC';
  tractorId: string | null;
  trailerId: string | null;
}> {
  if (!plate) return { allocationType: 'GENERIC', tractorId: null, trailerId: null };
  const [tractor, trailer] = await Promise.all([
    prisma.tractor.findUnique({ where: { plate }, select: { id: true } }),
    prisma.trailer.findUnique({ where: { plate }, select: { id: true } })
  ]);
  if (tractor && !trailer) return { allocationType: 'TRACTOR', tractorId: tractor.id, trailerId: null };
  if (trailer && !tractor) return { allocationType: 'TRAILER', tractorId: null, trailerId: trailer.id };
  return { allocationType: 'GENERIC', tractorId: null, trailerId: null };
}

async function findContractId(contractNumber: string | null): Promise<string | null> {
  if (!contractNumber) return null;
  const target = normalizeText(contractNumber);
  const contracts = await prisma.leaseContract.findMany({
    where: { contractNumber: { not: null } },
    select: { id: true, contractNumber: true }
  });
  return contracts.find((contract) => normalizeText(contract.contractNumber || '') === target)?.id ?? null;
}

async function importContract(
  parsed: ParsedLeaseContract,
  buffer: Buffer,
  fileName: string,
  extractedText: string,
  extractionStatus: string
): Promise<{ id: string | null; duplicate: boolean }> {
  const importKey = `lease-contract:sha256:${createHash('sha256').update(buffer).digest('hex')}`;
  const duplicate = await prisma.leaseContract.findUnique({ where: { importKey }, select: { id: true } });
  if (duplicate) return { id: duplicate.id, duplicate: true };

  const [lessorId, vehicle] = await Promise.all([
    ensureSupplierId(parsed.lessorName),
    resolveVehicle(parsed.plate)
  ]);
  const stored = await storePdfBuffer(buffer, fileName);
  const reviewReasons = [
    extractionStatus,
    ...parsed.reviewReasons,
    vehicle.allocationType === 'GENERIC' ? 'Assegna un trattore o semirimorchio prima di attivare il piano.' : ''
  ].filter(Boolean).join(' ');

  try {
    const created = await prisma.leaseContract.create({
      data: {
        status: 'PENDING',
        source: 'IMPORT',
        importKey,
        lessorId,
        lessorName: parsed.lessorName,
        vehicleSupplierName: parsed.vehicleSupplierName,
        contractNumber: parsed.contractNumber,
        contractDate: parsed.contractDate,
        startDate: parsed.startDate,
        durationMonths: parsed.durationMonths,
        installmentCount: parsed.installmentCount,
        recurringInstallmentCount: parsed.recurringInstallmentCount,
        frequencyMonths: parsed.frequencyMonths,
        advancePaymentNetCents: parsed.advancePaymentNetCents,
        recurringPaymentNetCents: parsed.recurringPaymentNetCents,
        totalInstallmentsNetCents: parsed.totalInstallmentsNetCents,
        purchasePriceNetCents: parsed.purchasePriceNetCents,
        buyoutNetCents: parsed.buyoutNetCents,
        vatRatePercent: parsed.vatRatePercent,
        tanBasisPoints: parsed.tanBasisPoints,
        leaseRateBasisPoints: parsed.leaseRateBasisPoints,
        tractorId: vehicle.tractorId,
        trailerId: vehicle.trailerId,
        reviewReasons,
        extractedText: extractedText.slice(0, 100_000),
        filePath: stored.filePath,
        originalFileName: stored.originalFileName,
        fileSize: stored.fileSize,
        mimeType: stored.mimeType
      },
      select: { id: true }
    });
    return { id: created.id, duplicate: false };
  } catch (error) {
    await removeStoredPdf(stored.filePath).catch(() => undefined);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { id: null, duplicate: true };
    }
    throw error;
  }
}

async function importInvoice(
  parsed: ParsedLeaseInvoice,
  buffer: Buffer,
  fileName: string,
  extractionStatus: string
): Promise<{ id: string | null; duplicate: boolean }> {
  const importKey = parsed.lessorName && parsed.documentNumber
    ? `lease-invoice:${normalizeKeyPart(parsed.lessorName)}:${normalizeKeyPart(parsed.documentNumber)}`
    : `lease-invoice:sha256:${createHash('sha256').update(buffer).digest('hex')}`;
  const duplicate = await prisma.expenseDocument.findUnique({ where: { importKey }, select: { id: true } });
  if (duplicate) return { id: duplicate.id, duplicate: true };

  const [supplierId, categoryId, vehicle, leaseContractId] = await Promise.all([
    ensureSupplierId(parsed.lessorName),
    ensureLeasingCategoryId(),
    resolveVehicle(parsed.plate),
    findContractId(parsed.contractNumber)
  ]);
  const stored = await storePdfBuffer(buffer, fileName);
  const line = {
    imponibileCents: parsed.netAmountCents,
    vatCents: parsed.vatCents,
    totalCents: parsed.grossAmountCents
  };
  const totals = sumDocumentTotals([line]);
  const reviewReasons = [
    extractionStatus,
    ...parsed.reviewReasons,
    vehicle.allocationType === 'GENERIC' ? 'La fattura deve essere assegnata a una targa prima della conferma.' : '',
    parsed.contractNumber && !leaseContractId ? `Contratto ${parsed.contractNumber} non ancora collegato in anagrafica.` : ''
  ].filter(Boolean).join(' ');

  try {
    const created = await prisma.expenseDocument.create({
      data: {
        status: 'PENDING',
        source: 'LEASE_INVOICE_IMPORT',
        importKey,
        supplierId,
        supplierName: parsed.lessorName,
        leaseContractId,
        documentNumber: parsed.documentNumber,
        documentDate: parsed.documentDate,
        registeredAt: parsed.documentDate ?? new Date(),
        reviewReasons,
        notes: parsed.contractNumber ? `Contratto leasing ${parsed.contractNumber}` : null,
        ...totals,
        filePath: stored.filePath,
        originalFileName: stored.originalFileName,
        fileSize: stored.fileSize,
        mimeType: stored.mimeType,
        lines: {
          create: {
            position: 0,
            description: parsed.description,
            quantityMilli: 1000,
            unit: 'canone',
            unitPriceCents: parsed.netAmountCents,
            imponibileCents: parsed.netAmountCents,
            vatRatePercent: parsed.vatRatePercent,
            vatCents: parsed.vatCents,
            totalCents: parsed.grossAmountCents,
            categoryId,
            allocationType: vehicle.allocationType,
            tractorId: vehicle.tractorId,
            trailerId: vehicle.trailerId
          }
        }
      },
      select: { id: true }
    });
    return { id: created.id, duplicate: false };
  } catch (error) {
    await removeStoredPdf(stored.filePath).catch(() => undefined);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { id: null, duplicate: true };
    }
    throw error;
  }
}

export async function importLeasePdfFiles(files: File[]): Promise<LeaseImportResult> {
  const result: LeaseImportResult = {
    importedContracts: 0,
    importedInvoices: 0,
    duplicateDocuments: 0,
    lastContractId: null,
    lastInvoiceId: null,
    errors: []
  };

  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const extraction = await extractLeaseText(buffer);
      if (!extraction.text.trim()) throw new Error('Il PDF non contiene testo leggibile e l’OCR non ha prodotto risultati.');
      const parsed = parseLeaseDocument(extraction.text);
      if (parsed.kind === 'CONTRACT') {
        const imported = await importContract(parsed, buffer, file.name || 'contratto-leasing.pdf', extraction.text, extraction.status);
        if (imported.duplicate) result.duplicateDocuments += 1;
        else {
          result.importedContracts += 1;
          result.lastContractId = imported.id;
        }
      } else {
        const imported = await importInvoice(parsed, buffer, file.name || 'fattura-leasing.pdf', extraction.status);
        if (imported.duplicate) result.duplicateDocuments += 1;
        else {
          result.importedInvoices += 1;
          result.lastInvoiceId = imported.id;
        }
      }
    } catch (error) {
      console.error('Import leasing fallito.', {
        fileName: file.name,
        error: error instanceof Error ? error.message : String(error)
      });
      result.errors.push(`${file.name}: ${errorMessage(error)}`);
    }
  }

  return result;
}
