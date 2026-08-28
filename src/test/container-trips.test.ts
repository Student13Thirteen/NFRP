import {
  ContainerTripExtraStatus,
  ContainerTripStatus
} from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  buildContainerTripFormSuggestions,
  getContainerTripClosureIssues,
  isContainerTripClosedForCosts
} from '@/lib/container-trips';

function closureData(overrides: Partial<Parameters<typeof getContainerTripClosureIssues>[0]> = {}) {
  return {
    actualKm: 581,
    customerCode: 'CLI-01',
    customerName: 'Committente esempio',
    freightRevenueCents: 85_000,
    odometerEndKm: null,
    odometerStartKm: null,
    containers: [{ containerNumber: 'MSCU1234567', containerType: '40HC' }],
    stops: [{}],
    extras: [{ status: ContainerTripExtraStatus.APPROVED }],
    ...overrides
  };
}

describe('chiusura trasporti container', () => {
  it('richiede km, ricavo, container, tappa e decisione su ogni extra', () => {
    expect(getContainerTripClosureIssues(closureData({
      actualKm: null,
      freightRevenueCents: null,
      containers: [],
      stops: [],
      extras: [{ status: ContainerTripExtraStatus.PROPOSED }]
    }))).toEqual([
      'almeno un container',
      'almeno una tappa',
      'km finali',
      'ricavo base',
      'decisione su tutti gli extra'
    ]);
  });

  it('accetta i km calcolati dai due contachilometri', () => {
    expect(getContainerTripClosureIssues(closureData({
      actualKm: null,
      odometerStartKm: 800_630,
      odometerEndKm: 801_211
    }))).toEqual([]);
  });

  it('considera contabili solo i viaggi chiusi o fatturati', () => {
    expect(isContainerTripClosedForCosts(ContainerTripStatus.PLANNED)).toBe(false);
    expect(isContainerTripClosedForCosts(ContainerTripStatus.UNDER_REVIEW)).toBe(false);
    expect(isContainerTripClosedForCosts(ContainerTripStatus.READY_TO_BILL)).toBe(true);
    expect(isContainerTripClosedForCosts(ContainerTripStatus.INVOICED)).toBe(true);
  });
});

describe('tendine guidate del foglio viaggi container', () => {
  it('raccoglie luoghi e vettori dai viaggi salvati e dalle bolle gia acquisite', () => {
    const suggestions = buildContainerTripFormSuggestions({
      trips: [{
        loadingTerminalName: 'VTE Voltri',
        deliveryTerminalName: 'ONT Magazzini Generali',
        returnBaseName: 'Tortona',
        carrierName: 'Trasporti Rossi',
        stops: [{ name: 'Rivalta Scrivia' }]
      }],
      importRows: [{
        loadingBaseName: 'PSA Genova Pra',
        loadingTerminalName: null,
        deliveryTerminalName: 'VEDI DELIVERY',
        deliveryName: 'Interporto Bologna',
        carrierName: 'Trasporti Rossi'
      }]
    });

    expect(suggestions.locations).toEqual([
      'Interporto Bologna',
      'ONT Magazzini Generali',
      'PSA Genova Pra',
      'Rivalta Scrivia',
      'Tortona',
      'VTE Voltri'
    ]);
    // `VEDI DELIVERY` e un rimando stampato sulla bolla, non un luogo selezionabile.
    expect(suggestions.locations).not.toContain('VEDI DELIVERY');
    // Il vettore ripetuto nelle due fonti resta una sola voce.
    expect(suggestions.carriers).toEqual(['NFRP SRL', 'Trasporti Rossi']);
  });

  it('resta utilizzabile quando non ci sono ancora dati reali', () => {
    expect(buildContainerTripFormSuggestions({ trips: [] })).toEqual({
      locations: [],
      carriers: ['NFRP SRL']
    });
  });
});
