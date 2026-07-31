import 'server-only';

import { prisma } from '@/lib/db';
import { removeStoredPdf } from '@/lib/files';
import { buildLeaseSchedule } from '@/lib/lease-schedule';
import { parseItalianMoneyToCents } from '@/lib/lease-parser';

function text(formData: FormData, name: string): string {
  return String(formData.get(name) || '').trim();
}

function integer(formData: FormData, name: string, required = false): number | null {
  const raw = text(formData, name);
  if (!raw) {
    if (required) throw new Error(`Compila il campo ${name}.`);
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`Il campo ${name} non è valido.`);
  return parsed;
}

function money(formData: FormData, name: string): number | null {
  const raw = text(formData, name);
  if (!raw) return null;
  const parsed = parseItalianMoneyToCents(raw);
  if (parsed === null || parsed < 0) throw new Error(`L'importo ${name} non è valido.`);
  return parsed;
}

function date(formData: FormData, name: string, required = false): Date | null {
  const raw = text(formData, name);
  if (!raw) {
    if (required) throw new Error(`Compila il campo ${name}.`);
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) throw new Error(`La data ${name} non è valida.`);
  const result = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    result.getUTCFullYear() !== Number(match[1]) ||
    result.getUTCMonth() !== Number(match[2]) - 1 ||
    result.getUTCDate() !== Number(match[3])
  ) {
    throw new Error(`La data ${name} non è valida.`);
  }
  return result;
}

function basisPoints(formData: FormData, name: string): number | null {
  const raw = text(formData, name);
  if (!raw) return null;
  const parsed = Number(raw.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) throw new Error(`La percentuale ${name} non è valida.`);
  return Math.round(parsed * 100);
}

async function ensureSupplierId(name: string): Promise<string> {
  const existing = await prisma.supplier.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true }
  });
  if (existing) return existing.id;
  const created = await prisma.supplier.create({
    data: { name, notes: 'Aggiunto automaticamente durante validazione leasing.' },
    select: { id: true }
  });
  return created.id;
}

export async function activateLeaseContractFromForm(contractId: string, formData: FormData): Promise<void> {
  const lessorName = text(formData, 'lessorName');
  const contractNumber = text(formData, 'contractNumber');
  const vehicleKey = text(formData, 'vehicleKey');
  const startDate = date(formData, 'startDate', true);
  const recurringPaymentNetCents = money(formData, 'recurringPaymentNet');
  const recurringInstallmentCount = integer(formData, 'recurringInstallmentCount', true);
  const frequencyMonths = integer(formData, 'frequencyMonths', true);
  const vatRatePercent = integer(formData, 'vatRatePercent', true);

  if (!lessorName) throw new Error('Indica il locatore/società di leasing.');
  if (!contractNumber) throw new Error('Indica il numero del contratto.');
  if (!startDate) throw new Error('Indica la decorrenza effettiva dei canoni.');
  if (!recurringPaymentNetCents || recurringPaymentNetCents <= 0) throw new Error('Indica l’importo netto del canone periodico.');
  if (!recurringInstallmentCount || recurringInstallmentCount <= 0) throw new Error('Indica il numero di canoni periodici.');
  if (!frequencyMonths || frequencyMonths <= 0 || frequencyMonths > 12) throw new Error('La periodicità dei canoni non è valida.');
  if (vatRatePercent === null || vatRatePercent < 0 || vatRatePercent > 100) throw new Error('L’aliquota IVA non è valida.');

  const [vehicleType, vehicleId] = vehicleKey.split(':');
  if (!vehicleId || (vehicleType !== 'TRACTOR' && vehicleType !== 'TRAILER')) {
    throw new Error('Assegna il contratto a un trattore o semirimorchio.');
  }
  const [tractor, trailer] = await Promise.all([
    vehicleType === 'TRACTOR' ? prisma.tractor.findUnique({ where: { id: vehicleId }, select: { id: true } }) : null,
    vehicleType === 'TRAILER' ? prisma.trailer.findUnique({ where: { id: vehicleId }, select: { id: true } }) : null
  ]);
  if (vehicleType === 'TRACTOR' && !tractor) throw new Error('Il trattore selezionato non esiste.');
  if (vehicleType === 'TRAILER' && !trailer) throw new Error('Il semirimorchio selezionato non esiste.');

  const advancePaymentNetCents = money(formData, 'advancePaymentNet');
  const schedule = buildLeaseSchedule({
    startDate,
    advancePaymentNetCents,
    recurringPaymentNetCents,
    recurringInstallmentCount,
    frequencyMonths,
    vatRatePercent
  });
  const installmentCount = schedule.length;
  const calculatedTotal = schedule.reduce((sum, row) => sum + row.netAmountCents, 0);
  const lessorId = await ensureSupplierId(lessorName);

  await prisma.$transaction(async (tx) => {
    const current = await tx.leaseContract.findUnique({ where: { id: contractId }, select: { status: true } });
    if (!current) throw new Error('Contratto leasing non trovato.');
    if (current.status !== 'PENDING') throw new Error('Il contratto è già stato validato.');

    await tx.leaseInstallment.deleteMany({ where: { contractId } });
    await tx.leaseContract.update({
      where: { id: contractId },
      data: {
        status: 'ACTIVE',
        lessorId,
        lessorName,
        vehicleSupplierName: text(formData, 'vehicleSupplierName') || null,
        contractNumber,
        contractDate: date(formData, 'contractDate'),
        startDate,
        durationMonths: integer(formData, 'durationMonths'),
        installmentCount,
        recurringInstallmentCount,
        frequencyMonths,
        advancePaymentNetCents,
        recurringPaymentNetCents,
        totalInstallmentsNetCents: money(formData, 'totalInstallmentsNet') ?? calculatedTotal,
        purchasePriceNetCents: money(formData, 'purchasePriceNet'),
        buyoutNetCents: money(formData, 'buyoutNet'),
        vatRatePercent,
        tanBasisPoints: basisPoints(formData, 'tanPercent'),
        leaseRateBasisPoints: basisPoints(formData, 'leaseRatePercent'),
        tractorId: tractor?.id ?? null,
        trailerId: trailer?.id ?? null,
        reviewReasons: null,
        notes: text(formData, 'notes') || null,
        installments: {
          create: schedule.map((row) => ({
            position: row.position,
            kind: row.kind,
            dueDate: row.dueDate,
            netAmountCents: row.netAmountCents,
            vatRatePercent: row.vatRatePercent,
            vatCents: row.vatCents,
            grossAmountCents: row.grossAmountCents
          }))
        }
      }
    });
  });
}

export async function deletePendingLeaseContract(contractId: string): Promise<void> {
  const contract = await prisma.leaseContract.findUnique({
    where: { id: contractId },
    select: { status: true, filePath: true }
  });
  if (!contract) return;
  if (contract.status !== 'PENDING') throw new Error('Solo i contratti ancora da verificare possono essere eliminati.');
  await prisma.leaseContract.delete({ where: { id: contractId } });
  if (contract.filePath) await removeStoredPdf(contract.filePath).catch(() => undefined);
}

export async function cancelLeaseContract(contractId: string): Promise<void> {
  const contract = await prisma.leaseContract.findUnique({ where: { id: contractId }, select: { status: true } });
  if (!contract) throw new Error('Contratto leasing non trovato.');
  if (contract.status !== 'ACTIVE') throw new Error('Solo un contratto attivo può essere annullato.');
  await prisma.leaseContract.update({ where: { id: contractId }, data: { status: 'CANCELLED' } });
}
