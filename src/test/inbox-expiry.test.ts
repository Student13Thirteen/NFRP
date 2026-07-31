import { EntityType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { findBarratoRosaLibrettoExpiryOverride } from '@/lib/inbox-expiry';

describe('inbox expiry overrides', () => {
  it('uses the newest barrato rosa expiry for a libretto on the same vehicle', () => {
    const override = findBarratoRosaLibrettoExpiryOverride(
      'Libretto/Revisione Trattore',
      { entityType: EntityType.TRACTOR, entityId: 'tractor-1' },
      [
        {
          entityType: EntityType.TRACTOR,
          entityId: 'tractor-1',
          label: 'ZZ109ZZ',
          expiryDate: new Date('2026-02-28T00:00:00.000Z')
        },
        {
          entityType: EntityType.TRACTOR,
          entityId: 'tractor-1',
          label: 'ZZ109ZZ',
          expiryDate: new Date('2027-03-31T00:00:00.000Z')
        },
        {
          entityType: EntityType.TRAILER,
          entityId: 'trailer-1',
          label: 'TR123AB',
          expiryDate: new Date('2028-01-31T00:00:00.000Z')
        }
      ]
    );

    expect(override?.expiryDate.toISOString()).toBe('2027-03-31T00:00:00.000Z');
    expect(override?.evidence).toContain('Barrato rosa');
    expect(override?.evidence).toContain('ZZ109ZZ');
  });

  it('ignores an already-expired barrato rosa instead of forcing a past expiry', () => {
    const override = findBarratoRosaLibrettoExpiryOverride(
      'Libretto/Revisione Semirimorchio',
      { entityType: EntityType.TRAILER, entityId: 'trailer-xa633pp' },
      [
        {
          entityType: EntityType.TRAILER,
          entityId: 'trailer-xa633pp',
          label: 'ZZ117ZZ',
          expiryDate: new Date('2026-06-06T00:00:00.000Z')
        }
      ],
      new Date('2026-06-29T00:00:00.000Z')
    );

    expect(override).toBeNull();
  });

  it('prefers a not-yet-expired barrato rosa over an older expired one', () => {
    const override = findBarratoRosaLibrettoExpiryOverride(
      'Libretto/Revisione Semirimorchio',
      { entityType: EntityType.TRAILER, entityId: 'trailer-xa633pp' },
      [
        {
          entityType: EntityType.TRAILER,
          entityId: 'trailer-xa633pp',
          label: 'ZZ117ZZ',
          expiryDate: new Date('2026-06-06T00:00:00.000Z')
        },
        {
          entityType: EntityType.TRAILER,
          entityId: 'trailer-xa633pp',
          label: 'ZZ117ZZ',
          expiryDate: new Date('2027-06-06T00:00:00.000Z')
        }
      ],
      new Date('2026-06-29T00:00:00.000Z')
    );

    expect(override?.expiryDate.toISOString()).toBe('2027-06-06T00:00:00.000Z');
    expect(override?.evidence).toContain('ZZ117ZZ');
  });

  it('does not override non-libretto documents', () => {
    const override = findBarratoRosaLibrettoExpiryOverride(
      'Assicurazione Trattore',
      { entityType: EntityType.TRACTOR, entityId: 'tractor-1' },
      [{
        entityType: EntityType.TRACTOR,
        entityId: 'tractor-1',
        label: 'ZZ109ZZ',
        expiryDate: new Date('2027-03-31T00:00:00.000Z')
      }]
    );

    expect(override).toBeNull();
  });
});
