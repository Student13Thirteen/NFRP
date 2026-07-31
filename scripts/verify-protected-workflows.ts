import { PrismaClient } from '@prisma/client';
import { createSessionToken, SESSION_COOKIE_NAME, verifySessionToken } from '../src/lib/auth-session';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true, email: true } });
  if (!user) throw new Error('Nessun utente disponibile per la verifica.');
  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + 600
  });
  if (!await verifySessionToken(token)) throw new Error('Token di verifica non valido nel container di controllo.');
  const baseUrl = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:3000';
  const cookieHeader = `${SESSION_COOKIE_NAME}=${token}`;
  const sessionProbe = await fetch(`${baseUrl}/api/document-inbox/status?ids=`, {
    headers: { Cookie: cookieHeader },
    redirect: 'manual'
  });
  if (!sessionProbe.ok) {
    throw new Error(`Sessione di verifica rifiutata dall'app (${sessionProbe.status}).`);
  }

  const expectations: Array<{ path: string; markers: string[] }> = [
    { path: '/trips', markers: ['Consegne carburante', 'Trasporti container'] },
    { path: '/trips/fuel', markers: ['Viaggi consegna carburante'] },
    { path: '/trips/container', markers: ['Trasporti container'] },
    { path: '/trips/container/settings', markers: ['Prezzario extra container', 'Nuova voce standard'] },
    { path: '/trips/import/review', markers: ['Conferma bolle container', 'Crea e completa'] },
    { path: '/trips/container/new', markers: ['Nuovo trasporto container', 'Data viaggio: giorno', 'Data viaggio: mese', 'Data viaggio: anno'] },
    { path: '/costs', markers: ['Centro costi', 'Trasporti container', 'Documenti flotta'] },
    {
      path: '/documents/inbox',
      markers: ['Inbox documenti', 'separati automaticamente', 'Carica e analizza']
    },
    {
      path: '/settings/document-types',
      markers: ['Tariffe revisione estintori', 'fireExtinguisherRate2', 'fireExtinguisherRate6', 'fireExtinguisherRate12']
    },
    { path: '/leases/import/review', markers: ['Data contratto: giorno', 'Data contratto: mese', 'Data contratto: anno'] }
  ];

  for (const expectation of expectations) {
    const response = await fetch(`${baseUrl}${expectation.path}`, {
      headers: { Cookie: cookieHeader },
      redirect: 'manual'
    });
    const body = await response.text();
    const missing = expectation.markers.filter((marker) => !body.includes(marker));
    const dayIndex = body.indexOf(': giorno');
    const monthIndex = body.indexOf(': mese');
    const yearIndex = body.indexOf(': anno');
    const dateOrderValid = dayIndex === -1 || (dayIndex < monthIndex && monthIndex < yearIndex);
    console.log(JSON.stringify({
      path: expectation.path,
      status: response.status,
      location: response.headers.get('location'),
      missing,
      dateOrderValid
    }));
    if (!response.ok || missing.length > 0 || !dateOrderValid) process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
