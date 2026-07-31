import 'server-only';

import { prisma } from '@/lib/db';
import {
  DEFAULT_FIRE_EXTINGUISHER_RATES,
  FIRE_EXTINGUISHER_RATES_SETTING_KEY,
  parseFireExtinguisherRates,
  serializeFireExtinguisherRates,
  type FireExtinguisherRate
} from '@/lib/fire-extinguisher';

export async function getFireExtinguisherRates(): Promise<FireExtinguisherRate[]> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: FIRE_EXTINGUISHER_RATES_SETTING_KEY },
    select: { value: true }
  });
  return parseFireExtinguisherRates(setting?.value);
}

export async function updateFireExtinguisherRates(rates: FireExtinguisherRate[]): Promise<void> {
  const normalized = DEFAULT_FIRE_EXTINGUISHER_RATES.map((defaultRate) => {
    const rate = rates.find((candidate) => candidate.capacityKg === defaultRate.capacityKg);
    if (!rate) throw new Error(`Tariffa ${defaultRate.capacityKg} kg mancante.`);
    return rate;
  });
  const value = serializeFireExtinguisherRates(normalized);

  await prisma.appSetting.upsert({
    where: { key: FIRE_EXTINGUISHER_RATES_SETTING_KEY },
    create: { key: FIRE_EXTINGUISHER_RATES_SETTING_KEY, value },
    update: { value }
  });
}
