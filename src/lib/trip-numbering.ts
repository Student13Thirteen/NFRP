import 'server-only';

import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';

type TripNumberingClient = Prisma.TransactionClient | PrismaClient;

export async function normalizeTripNumbers(client: TripNumberingClient = prisma) {
  const trips = await client.trip.findMany({
    select: { id: true, tripNumber: true },
    orderBy: [{ createdAt: 'asc' }, { tripNumber: 'asc' }]
  });

  const updates = trips
    .map((trip, index) => ({ id: trip.id, currentNumber: trip.tripNumber, nextNumber: index + 1 }))
    .filter((trip) => trip.currentNumber !== trip.nextNumber);

  if (updates.length === 0) return trips.length;

  for (const trip of updates) {
    await client.trip.update({
      where: { id: trip.id },
      data: { tripNumber: -trip.nextNumber }
    });
  }

  for (const trip of updates) {
    await client.trip.update({
      where: { id: trip.id },
      data: { tripNumber: trip.nextNumber }
    });
  }

  return trips.length;
}

export async function getNextTripNumber(client: TripNumberingClient = prisma) {
  const tripCount = await normalizeTripNumbers(client);
  return tripCount + 1;
}
