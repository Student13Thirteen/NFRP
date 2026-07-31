export type LeaseScheduleInput = {
  startDate: Date;
  advancePaymentNetCents: number | null;
  recurringPaymentNetCents: number;
  recurringInstallmentCount: number;
  frequencyMonths: number;
  vatRatePercent: number;
};

export type LeaseScheduleRow = {
  position: number;
  kind: 'ADVANCE' | 'REGULAR';
  dueDate: Date;
  netAmountCents: number;
  vatRatePercent: number;
  vatCents: number;
  grossAmountCents: number;
};

function addUtcMonths(date: Date, months: number): Date {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const day = date.getUTCDate();
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function scheduleRow(
  position: number,
  kind: LeaseScheduleRow['kind'],
  dueDate: Date,
  netAmountCents: number,
  vatRatePercent: number
): LeaseScheduleRow {
  const vatCents = Math.round((netAmountCents * vatRatePercent) / 100);
  return {
    position,
    kind,
    dueDate,
    netAmountCents,
    vatRatePercent,
    vatCents,
    grossAmountCents: netAmountCents + vatCents
  };
}

export function buildLeaseSchedule(input: LeaseScheduleInput): LeaseScheduleRow[] {
  const rows: LeaseScheduleRow[] = [];
  const frequencyMonths = Math.max(1, Math.trunc(input.frequencyMonths));
  let position = 1;
  let recurringOffset = 0;

  if (input.advancePaymentNetCents && input.advancePaymentNetCents > 0) {
    rows.push(scheduleRow(position, 'ADVANCE', input.startDate, input.advancePaymentNetCents, input.vatRatePercent));
    position += 1;
    recurringOffset = frequencyMonths;
  }

  for (let index = 0; index < input.recurringInstallmentCount; index += 1) {
    rows.push(
      scheduleRow(
        position,
        'REGULAR',
        addUtcMonths(input.startDate, recurringOffset + index * frequencyMonths),
        input.recurringPaymentNetCents,
        input.vatRatePercent
      )
    );
    position += 1;
  }

  return rows;
}
