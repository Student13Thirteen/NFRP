import { PrismaClient } from '@prisma/client';
import { createSessionToken, SESSION_COOKIE_NAME, verifySessionToken } from '../src/lib/auth-session';

const prisma = new PrismaClient();

type PageExpectation = {
  path: string;
  markers: string[];
  activeNavigationHref?: string;
};

function hasExactlyOneActiveNavigationLink(body: string, href: string): boolean {
  const navigation = body.match(/<nav\b[^>]*class="[^"]*sidebar-nav[^"]*"[^>]*>[\s\S]*?<\/nav>/)?.[0] || '';
  const anchors = navigation.match(/<a\b[^>]*>/g) || [];
  const activeLinks = anchors.filter((anchor) => anchor.includes('aria-current="page"'));
  return activeLinks.length === 1 && activeLinks[0].includes(`href="${href}"`);
}

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true, email: true } });
  if (!user) throw new Error('Nessun utente disponibile per la verifica.');
  const tractor = await prisma.tractor.findFirst({ orderBy: { plate: 'asc' }, select: { id: true } });
  const trailer = await prisma.trailer.findFirst({ orderBy: { plate: 'asc' }, select: { id: true } });
  const pendingLease = await prisma.leaseContract.findFirst({ where: { status: 'PENDING' }, select: { id: true } });
  // Una targa con documenti gia sostituiti: serve a verificare che lo storico
  // resti visibile ma separato dai documenti in vigore.
  const tractorWithHistory = await prisma.tractor.findFirst({
    where: { documents: { some: { status: { in: ['RENEWED', 'ARCHIVED'] } } } },
    orderBy: { plate: 'asc' },
    select: { id: true }
  });
  const driver = await prisma.driver.findFirst({ orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], select: { id: true } });
  const maintenance = await prisma.maintenance.findFirst({ orderBy: { maintenanceDate: 'desc' }, select: { id: true } });
  const confirmedExpense = await prisma.expenseDocument.findFirst({
    where: {
      status: 'CONFIRMED',
      lines: {
        some: {
          allocations: {
            some: { driverId: { not: null } }
          }
        }
      }
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true }
  });
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

  const expectations: PageExpectation[] = [
    {
      path: '/dashboard',
      markers: ['Nuova consegna carburante', 'Nuovo trasporto container', 'Manutenzioni', 'Inserisci nuova manutenzione', 'Nuovo verbale', 'Nuovo sinistro']
    },
    {
      path: '/trips',
      markers: ['Consegne carburante', 'Trasporti container', 'Importa bolle container'],
      activeNavigationHref: '/trips'
    },
    { path: '/trips/fuel', markers: ['Viaggi consegna carburante'] },
    { path: '/trips/new', markers: ['Nuova consegna carburante', 'Anagrafiche consegne', 'Salva consegna'] },
    { path: '/trips/container', markers: ['Trasporti container'] },
    { path: '/trips/container/settings', markers: ['Prezzario extra container', 'Nuova voce standard'] },
    { path: '/trips/import/review', markers: ['Conferma bolle container', 'Crea e completa'] },
    { path: '/trips/import', markers: ['propone la corrispondenza più probabile', 'la controlli o la correggi tu'] },
    {
      path: '/trips/container/new',
      markers: [
        'Nuovo trasporto container',
        'Cliente in anagrafica',
        'Data viaggio: giorno',
        'Data viaggio: mese',
        'Data viaggio: anno',
        'Mezzi non aziendali',
        'Targa semirimorchio non nostro'
      ]
    },
    { path: '/customers', markers: ['Clienti', 'Nuovo cliente', 'Partita IVA', 'Codice fiscale', 'PEC'] },
    {
      path: '/costs',
      markers: ['Centro costi', 'Trasporti container', 'Documenti flotta', 'Verbali', 'Sinistri stradali', 'Inserisci nuova manutenzione'],
      activeNavigationHref: '/costs'
    },
    {
      path: '/fines',
      markers: ['Verbali', 'Inserisci verbale', 'Pagamenti scaduti'],
      activeNavigationHref: '/fines'
    },
    {
      path: '/fines/new',
      markers: ['Inserisci verbale', 'Data infrazione: giorno', 'Scadenza ricorso: giorno', 'Tipo degli allegati iniziali', 'Salva verbale']
    },
    {
      path: '/road-accidents',
      markers: ['Sinistri stradali', 'Inserisci sinistro', 'Pratiche aperte'],
      activeNavigationHref: '/road-accidents'
    },
    {
      path: '/road-accidents/new',
      markers: ['Inserisci sinistro stradale', 'Data sinistro: giorno', 'Prossima scadenza: giorno', 'Tipo degli allegati iniziali', 'Salva sinistro']
    },
    {
      path: '/documents/inbox',
      markers: ['Inbox documenti', 'separati automaticamente', 'Carica e analizza', 'Torna ad Acquisizioni'],
      activeNavigationHref: '/acquisitions'
    },
    {
      path: '/settings/document-types',
      markers: ['Tariffe revisione estintori', 'fireExtinguisherRate2', 'fireExtinguisherRate6', 'fireExtinguisherRate12']
    },
    {
      path: '/leases/import/review',
      markers: pendingLease
        ? ['Data contratto: giorno', 'Data contratto: mese', 'Data contratto: anno']
        : ['Controlla contratti leasing', 'Nessun contratto leasing in attesa.']
    },
    {
      path: '/maintenances',
      markers: [
        'Cosa vuoi fare?',
        'Inserisci nuova manutenzione',
        'Importa manutenzioni da PDF',
        'Manutenzioni già inserite',
        'Da controllare'
      ],
      activeNavigationHref: '/maintenances'
    },
    {
      path: '/maintenances/new',
      // `Automatico:` compare solo dopo aver scelto un mezzo sulla riga: e reso lato client.
      markers: [
        'Inserisci nuova manutenzione',
        'Nuovo fornitore',
        'Data registrazione: giorno',
        'Sinistro collegato',
        '3.312',
        'Salva manutenzione',
        'Aggiungi riga'
      ]
    },
    { path: '/maintenances/settings', markers: ['Registro unico condiviso con Magazzino', 'Partita IVA', 'Codice fiscale', 'PEC'] },

    { path: '/documents/new', markers: ['Nuovo documento', 'Data emissione: giorno', 'Salva documento'] },
    { path: '/warehouse/new', markers: ['Nuovo record magazzino', 'Data carico: giorno', 'Salva record'] },
    { path: '/warehouse/settings', markers: ['Registro unico condiviso con Manutenzioni', 'Nuova categoria'] },
    {
      path: '/tolls',
      markers: ['Pedaggi', 'Tessere autostrade', 'Import autostrade CSV'],
      activeNavigationHref: '/tolls'
    },
    { path: '/tolls/import/review', markers: ['Controllo file autostrade', 'Pedaggi', 'Import CSV'] },
    {
      path: '/vehicles/tractors',
      markers: ['Mezzi a motore', 'Autista iniziale', 'Associazione dal: giorno', 'Trattori', 'Motrici', 'Autovetture', 'Da classificare']
    },
    {
      path: '/vehicles/trailers',
      markers: ['Semirimorchi', 'Allestimento', 'Carico cisterna', 'Container', 'Cisterne', 'Frigo']
    },
    {
      path: '/vehicles/trailers?type=TANK',
      markers: ['Carico cisterna', 'Benzina / Gasolio', 'GPL']
    },
    {
      path: '/vehicles/owners',
      markers: ['Proprietari mezzi terzi', 'Nuovo proprietario', 'Nome o ragione sociale']
    },
    {
      path: '/fuel/new',
      markers: ['Automatico:', 'Data: giorno', 'Scegli un mezzo associato a un trattore', 'Mezzo della flotta', 'Mezzo non nostro']
    }
  ];
  if (tractor) {
    expectations.push({
      path: `/vehicles/tractors/${tractor.id}`,
      markers: [
        'Assegnazioni autista',
        'Aggiungi associazione',
        'Registra il periodo',
        'Tipologia',
        'Semirimorchio abbinato',
        'Verbali e sinistri',
        'Documenti targa'
      ]
    });
  }
  if (trailer) {
    expectations.push({
      path: `/vehicles/trailers/${trailer.id}`,
      markers: ['Allestimento', 'Carico cisterna', 'Trattore abbinato', 'Documenti targa', 'Verbali e sinistri']
    });
  }
  if (tractorWithHistory) {
    expectations.push({
      path: `/vehicles/tractors/${tractorWithHistory.id}`,
      markers: ['Documenti sostituiti e archiviati', 'Apri lo storico completo']
    });
  }
  if (driver) {
    expectations.push({
      path: `/drivers/${driver.id}`,
      markers: ['Assunzione e cessazione', 'Storico rapporto di lavoro', 'Assegnazioni ai mezzi', 'Storico assegnazioni', 'Documenti autista', 'Verbali e sinistri']
    });
  }
  if (maintenance) {
    expectations.push({
      path: `/maintenances/${maintenance.id}`,
      markers: ['Modifica manutenzione', 'Automatico:', 'Usa il punto come separatore decimale']
    });
  }
  if (confirmedExpense) {
    expectations.push(
      {
        path: `/maintenances/expenses/${confirmedExpense.id}`,
        markers: ['Prezzo unit. netto', 'Autista']
      },
      {
        path: `/maintenances/expenses/${confirmedExpense.id}/edit`,
        markers: ['l’autista di ogni mezzo può invece essere corretto', 'allocationDriverSelection', 'Automatico:']
      }
    );
  }

  for (const expectation of expectations) {
    const response = await fetch(`${baseUrl}${expectation.path}`, {
      headers: { Cookie: cookieHeader },
      redirect: 'manual'
    });
    const body = await response.text();
    const missing = expectation.markers.filter((marker) => !body.includes(marker));
    const activeNavigationValid = expectation.activeNavigationHref
      ? hasExactlyOneActiveNavigationLink(body, expectation.activeNavigationHref)
      : true;
    const dayIndex = body.indexOf(': giorno');
    const monthIndex = body.indexOf(': mese');
    const yearIndex = body.indexOf(': anno');
    const dateOrderValid = dayIndex === -1 || (dayIndex < monthIndex && monthIndex < yearIndex);
    console.log(JSON.stringify({
      path: expectation.path,
      status: response.status,
      location: response.headers.get('location'),
      missing,
      activeNavigationValid,
      dateOrderValid
    }));
    if (!response.ok || missing.length > 0 || !activeNavigationValid || !dateOrderValid) process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
