/**
 * Ricalcola le metriche (delta km, consumo, euro/km, stato) di tutti i
 * rifornimenti gia presenti, su tutta la sequenza cronologica di ogni targa.
 *
 * Uso (dentro il container app, con server-only neutralizzato):
 *   NODE_OPTIONS='--conditions react-server' npx tsx scripts/recalc-fuel-metrics.ts
 *
 * Serve dopo la correzione del calcolo consumo (il vecchio valore era x10) per
 * sistemare i record storici senza reimportarli. Non cancella nulla.
 */
import { prisma } from '@/lib/db';
import { recalculateFuelMetricsForPlates } from '@/lib/fuel-import';

async function main() {
  const plates = await prisma.fuelEntry.findMany({ select: { plate: true }, distinct: ['plate'] });
  const plateList = plates.map((row) => row.plate);

  if (plateList.length === 0) {
    console.log('Nessun rifornimento da ricalcolare.');
    return;
  }

  await recalculateFuelMetricsForPlates(prisma, plateList);
  console.log(`Metriche ricalcolate su ${plateList.length} targhe.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Ricalcolo metriche fallito.', error);
    await prisma.$disconnect();
    process.exit(1);
  });
