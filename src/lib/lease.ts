import { Prisma } from '@prisma/client';
import { formatEuroCents } from '@/lib/expense-shared';
import { getVehicleLabel } from '@/lib/trips';

export const leaseContractInclude = Prisma.validator<Prisma.LeaseContractInclude>()({
  lessor: true,
  tractor: true,
  trailer: true,
  installments: { orderBy: { position: 'asc' } },
  invoices: {
    include: { lines: true },
    orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }]
  }
});

export type LeaseContractWithRelations = Prisma.LeaseContractGetPayload<{ include: typeof leaseContractInclude }>;

export function getLeaseStatusLabel(status: LeaseContractWithRelations['status']): string {
  switch (status) {
    case 'PENDING':
      return 'Da verificare';
    case 'ACTIVE':
      return 'Attivo';
    case 'CLOSED':
      return 'Concluso';
    case 'CANCELLED':
      return 'Annullato';
    default:
      return status;
  }
}

export function getLeaseInstallmentKindLabel(kind: 'ADVANCE' | 'REGULAR' | 'BUYOUT'): string {
  switch (kind) {
    case 'ADVANCE':
      return 'Primo canone / anticipo';
    case 'BUYOUT':
      return 'Riscatto';
    default:
      return 'Canone periodico';
  }
}

export function getLeaseVehicleLabel(contract: {
  tractor?: { plate: string; brand: string | null; model: string | null } | null;
  trailer?: { plate: string; brand: string | null; model: string | null } | null;
}): string {
  if (contract.tractor) return `Trattore ${getVehicleLabel(contract.tractor)}`;
  if (contract.trailer) return `Semirimorchio ${getVehicleLabel(contract.trailer)}`;
  return 'Targa da assegnare';
}

export function getLeasePlate(contract: {
  tractor?: { plate: string } | null;
  trailer?: { plate: string } | null;
}): string | null {
  return contract.tractor?.plate || contract.trailer?.plate || null;
}

export function formatLeaseMoney(value: number | null | undefined): string {
  return formatEuroCents(value);
}

export function formatBasisPoints(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${(value / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}%`;
}
