import { TripBillingStatus, TripStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { generateTripPdf } from '@/lib/trip-pdf';
import type { TripWithRelations } from '@/lib/trips';

describe('trip PDF generation', () => {
  it('creates an A4 PDF with the sales point and plant code visible in the content stream', () => {
    const now = new Date('2026-05-27T00:00:00.000Z');
    const trip = {
      id: 'trip-1',
      tripNumber: 1324,
      tripDate: now,
      status: TripStatus.PLANNED,
      billingStatus: TripBillingStatus.TO_BILL,
      sequenceNumber: 2,
      expectedKm: 241,
      odometerStartKm: 102000,
      odometerEndKm: 102241,
      loadingBaseId: 'base-1',
      loadingBase: {
        id: 'base-1',
        name: 'ITA.CA SPA',
        address: 'Deposito base di carico',
        postalCode: null,
        city: null,
        province: null,
        country: null,
        notes: null,
        active: true,
        createdAt: now,
        updatedAt: now
      },
      salesPointId: 'point-1',
      salesPoint: {
        id: 'point-1',
        name: 'CARBUREX S.R.L.',
        plantCode: '54H',
        address: 'LOC MOLO AZZURRA SNC',
        postalCode: null,
        city: 'FORMIA (LT)',
        province: null,
        country: null,
        notes: null,
        active: true,
        createdAt: now,
        updatedAt: now
      },
      driverId: 'driver-1',
      driver: {
        id: 'driver-1',
        firstName: 'Nicola',
        lastName: 'Longobardo',
        phone: null,
        email: null,
        notes: null,
        active: true,
        createdAt: now,
        updatedAt: now
      },
      tractorId: 'tractor-1',
      tractor: {
        id: 'tractor-1',
        plate: 'ZZ109ZZ',
        brand: null,
        model: null,
        notes: null,
        active: true,
        lifecycleStatus: 'ACTIVE',
        lifecycleEndedAt: null,
        assignedDriverId: null,
        createdAt: now,
        updatedAt: now
      },
      trailerId: 'trailer-1',
      trailer: {
        id: 'trailer-1',
        plate: 'ZZ117ZZ',
        brand: null,
        model: null,
        notes: null,
        active: true,
        lifecycleStatus: 'ACTIVE',
        lifecycleEndedAt: null,
        assignedTractorId: null,
        createdAt: now,
        updatedAt: now
      },
      productId: 'product-1',
      product: {
        id: 'product-1',
        name: 'Gasolio motopesca contenuto biodiesel non superiore al 7 percento uso navale agevolato',
        unitLabel: 'L',
        notes: 'Uso motopesca, controllare destinazione prima dello scarico',
        active: true,
        createdAt: now,
        updatedAt: now
      },
      liters: 35000,
      productLines: [
        {
          id: 'line-1',
          tripId: 'trip-1',
          salesPointId: 'point-1',
          salesPoint: {
            id: 'point-1',
            name: 'CARBUREX S.R.L.',
            plantCode: '54H',
            address: 'LOC MOLO AZZURRA SNC',
            postalCode: null,
            city: 'FORMIA (LT)',
            province: null,
            country: null,
            notes: null,
            active: true,
            createdAt: now,
            updatedAt: now
          },
          productId: 'product-1',
          product: {
            id: 'product-1',
            name: 'Gasolio motopesca contenuto biodiesel non superiore al 7 percento uso navale agevolato',
            unitLabel: 'L',
            notes: 'Uso motopesca, controllare destinazione prima dello scarico',
            active: true,
            createdAt: now,
            updatedAt: now
          },
          liters: 35000,
          position: 0,
          createdAt: now,
          updatedAt: now
        }
      ],
      gasolineLiters: 0,
      dieselLiters: 0,
      gplLiters: 0,
      jetLiters: 0,
      customerId: null,
      customer: null,
      customerName: 'TIBER SRL',
      customerReference: 'Spedizione 1',
      carrierName: null,
      transportDocumentNumber: 'DDT-27',
      transportDocumentDate: now,
      invoiceNumber: null,
      invoiceDate: null,
      freightRevenueCents: 85000,
      carrierCostCents: 0,
      tollCostCents: 0,
      extraCostCents: 0,
      economicNotes: null,
      notes: 'Base Sonatrach tramite altra azienda',
      createdAt: now,
      updatedAt: now
    } satisfies TripWithRelations;

    const pdf = generateTripPdf(trip);
    const content = pdf.toString('latin1');

    expect(content.startsWith('%PDF-1.4')).toBe(true);
    expect(content).toContain('DATA 27/05/2026');
    expect(content).not.toContain('N. 1324');
    expect(content).toContain('CARBUREX');
    expect(content).toContain('S.R.L.');
    expect(content).toContain('54H');
    expect(content).toContain('LOC MOLO AZZURRA SNC - FORMIA \\(LT\\)');
    expect(content).toContain('GASOLIO MOTOPESCA');
    expect(content).toContain('BIODIESEL');
    expect(content).toContain('NAVALE');
    expect(content).toContain('AGEVOLATO');
    expect(content).toContain('Uso motopesca, controllare destinazione');
    expect(content).toContain('scarico');
    expect(content).toContain('35.000 L');
    expect(content).toContain('QUANTITÀ DA SCARICARE');
    expect(content).toContain('NOTE VIAGGIO');
    expect(content).toContain('Base Sonatrach tramite altra azienda');
    expect(content).toContain('SEQUENZA');
    expect(content).toContain('KM');
    expect(content).not.toContain('SEQUENZA / KM');
    expect(content).toContain('Targa trattore'.toUpperCase());
    expect(content).toContain('TIBER SRL');
    expect(content).toContain('Spedizione 1');
    expect(content).toContain('DDT-27');
    expect(content).toContain('/MediaBox [0 0 595.28 841.89]');
  });

  it('prints multiple unloading rows with sales point, product and liters', () => {
    const now = new Date('2026-05-28T00:00:00.000Z');
    const salesPointA = {
      id: 'point-a',
      name: 'PUNTO A',
      plantCode: 'A1',
      address: 'Via Alfa 1',
      postalCode: null,
      city: 'NAPOLI',
      province: null,
      country: null,
      notes: null,
      active: true,
      createdAt: now,
      updatedAt: now
    };
    const salesPointB = {
      id: 'point-b',
      name: 'PUNTO B',
      plantCode: 'B2',
      address: 'Via Beta 2',
      postalCode: null,
      city: 'ROMA',
      province: null,
      country: null,
      notes: null,
      active: true,
      createdAt: now,
      updatedAt: now
    };
    const productA = {
      id: 'product-a',
      name: 'Gasolio',
      unitLabel: 'L',
      notes: null,
      active: true,
      createdAt: now,
      updatedAt: now
    };
    const productB = {
      id: 'product-b',
      name: 'Benzina',
      unitLabel: 'L',
      notes: null,
      active: true,
      createdAt: now,
      updatedAt: now
    };
    const trip = {
      id: 'trip-2',
      tripNumber: 1325,
      tripDate: now,
      status: TripStatus.PLANNED,
      billingStatus: TripBillingStatus.NOT_READY,
      sequenceNumber: 1,
      expectedKm: 120,
      odometerStartKm: null,
      odometerEndKm: null,
      loadingBaseId: 'base-1',
      loadingBase: {
        id: 'base-1',
        name: 'ITA.CA SPA',
        address: 'Deposito base di carico',
        postalCode: null,
        city: null,
        province: null,
        country: null,
        notes: null,
        active: true,
        createdAt: now,
        updatedAt: now
      },
      salesPointId: salesPointA.id,
      salesPoint: salesPointA,
      driverId: null,
      driver: null,
      tractorId: null,
      tractor: null,
      trailerId: null,
      trailer: null,
      productId: productA.id,
      product: productA,
      liters: 12000,
      productLines: [
        {
          id: 'line-a',
          tripId: 'trip-2',
          salesPointId: salesPointA.id,
          salesPoint: salesPointA,
          productId: productA.id,
          product: productA,
          liters: 12000,
          position: 0,
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'line-b',
          tripId: 'trip-2',
          salesPointId: salesPointB.id,
          salesPoint: salesPointB,
          productId: productB.id,
          product: productB,
          liters: 8000,
          position: 1,
          createdAt: now,
          updatedAt: now
        }
      ],
      gasolineLiters: 0,
      dieselLiters: 0,
      gplLiters: 0,
      jetLiters: 0,
      customerId: null,
      customer: null,
      customerName: null,
      customerReference: null,
      carrierName: null,
      transportDocumentNumber: null,
      transportDocumentDate: null,
      invoiceNumber: null,
      invoiceDate: null,
      freightRevenueCents: null,
      carrierCostCents: null,
      tollCostCents: null,
      extraCostCents: null,
      economicNotes: null,
      notes: null,
      createdAt: now,
      updatedAt: now
    } satisfies TripWithRelations;

    const pdf = generateTripPdf(trip);
    const content = pdf.toString('latin1');

    expect(content).toContain('PUNTI DI CONSEGNA');
    expect(content).toContain('SCARICHI');
    expect(content).toContain('PUNTO A');
    expect(content).toContain('PUNTO B');
    expect(content).toContain('GASOLIO');
    expect(content).toContain('BENZINA');
    expect(content).toContain('12.000 L');
    expect(content).toContain('8000 L');
    expect(content).toContain('20.000 L');
  });
});
