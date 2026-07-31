export function startOfDay(date: Date): Date {
  const value = new Date(date);
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function daysUntil(date: Date, now = new Date()): number {
  const target = startOfDay(date).getTime();
  const current = startOfDay(now).getTime();
  return Math.ceil((target - current) / (1000 * 60 * 60 * 24));
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(date));
}

export function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return '';
  const value = new Date(date);
  return value.toISOString().slice(0, 10);
}
