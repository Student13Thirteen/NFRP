export type StructuredAddress = {
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
};

export function formatStructuredAddress(entity: StructuredAddress): string {
  const locality = [entity.postalCode, entity.city, entity.province].filter(Boolean).join(' ');
  return [entity.address, locality, entity.country].filter(Boolean).join(' - ');
}

export function buildMapsHref(entity: StructuredAddress): string | null {
  const address = formatStructuredAddress(entity);
  if (!address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
