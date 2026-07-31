export function formString(formData: FormData, key: string): string {
  return String(formData.get(key) || '').trim();
}

export function optionalFormString(formData: FormData, key: string): string | null {
  const value = formString(formData, key);
  return value === '' ? null : value;
}

export function formBoolean(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on';
}

export function normalizePlate(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}
