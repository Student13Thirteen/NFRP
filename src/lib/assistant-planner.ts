import { z } from 'zod';

export const assistantToolNames = [
  'searchDocuments',
  'getVehicleChecklist',
  'getExpiringSummary',
  'getMissingPdfSummary',
  'searchTrips',
  'getTripsSummary',
  'searchFuelEntries',
  'getFuelSummary',
  'searchTollEntries',
  'getTollSummary',
  'searchCosts',
  'getCostSummary',
  'searchMaintenances',
  'getMaintenanceSummary',
  'searchWarehouse',
  'getWarehouseSummary',
  'rankVehicleCosts',
  'compareVehicleCosts',
  'getVehicleCostTrend',
  'rankFuelEfficiency',
  'analyzeFuelAnomalies'
] as const;
export const assistantEntityTypes = ['DRIVER', 'TRACTOR', 'TRAILER', 'OTHER'] as const;
export const assistantSearchStatuses = ['expired', 'expiring', 'valid', 'inactive', 'all'] as const;
export const assistantTripStatuses = ['PLANNED', 'SENT', 'COMPLETED', 'CANCELLED'] as const;
export const assistantMaintenanceStatuses = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'ARCHIVED'] as const;
export const assistantWarehouseStatuses = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'ARCHIVED'] as const;
export const assistantCostSources = ['TRIPS', 'CONTAINER_TRIPS', 'FUEL', 'TOLLS', 'EXPENSE', 'MAINTENANCE', 'DOCUMENT', 'WAREHOUSE', 'WAREHOUSE_MOUNT'] as const;
export const assistantRankMetrics = ['spend', 'count', 'consumption', 'costPerKm'] as const;
export const assistantRankDirections = ['top', 'bottom'] as const;

export type AssistantToolName = (typeof assistantToolNames)[number];
export type AssistantEntityType = (typeof assistantEntityTypes)[number];
export type AssistantSearchStatus = (typeof assistantSearchStatuses)[number];
export type AssistantTripStatus = (typeof assistantTripStatuses)[number];
export type AssistantMaintenanceStatus = (typeof assistantMaintenanceStatuses)[number];
export type AssistantWarehouseStatus = (typeof assistantWarehouseStatuses)[number];
export type AssistantCostSource = (typeof assistantCostSources)[number];
export type AssistantRankMetric = (typeof assistantRankMetrics)[number];
export type AssistantRankDirection = (typeof assistantRankDirections)[number];

export type AssistantConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export const assistantToolArgumentsSchema = z
  .object({
    plate: z.string().trim().max(32).optional().nullable(),
    documentTypeName: z.string().trim().max(80).optional().nullable(),
    status: z.enum(assistantSearchStatuses).optional().nullable(),
    withinDays: z.number().int().min(1).max(365).optional().nullable(),
    missingPdf: z.boolean().optional().nullable(),
    entityType: z.enum(assistantEntityTypes).optional().nullable(),
    query: z.string().trim().max(120).optional().nullable(),
    tripStatus: z.enum(assistantTripStatuses).optional().nullable(),
    maintenanceStatus: z.enum(assistantMaintenanceStatuses).optional().nullable(),
    maintenanceCategoryName: z.string().trim().max(80).optional().nullable(),
    warehouseStatus: z.enum(assistantWarehouseStatuses).optional().nullable(),
    warehouseCategoryName: z.string().trim().max(80).optional().nullable(),
    location: z.string().trim().max(120).optional().nullable(),
    supplierName: z.string().trim().max(120).optional().nullable(),
    fuelSupplierName: z.string().trim().max(120).optional().nullable(),
    fuelCardNumber: z.string().trim().max(80).optional().nullable(),
    fuelProductName: z.string().trim().max(80).optional().nullable(),
    fuelNeedsReview: z.boolean().optional().nullable(),
    tollCardNumber: z.string().trim().max(80).optional().nullable(),
    tollNeedsReview: z.boolean().optional().nullable(),
    costSource: z.enum(assistantCostSources).optional().nullable(),
    costCategoryName: z.string().trim().max(80).optional().nullable(),
    includeInternal: z.boolean().optional().nullable(),
    rankMetric: z.enum(assistantRankMetrics).optional().nullable(),
    rankDirection: z.enum(assistantRankDirections).optional().nullable(),
    plates: z.array(z.string().trim().max(32)).max(6).optional().nullable()
  })
  .strict();

export type AssistantToolArguments = z.infer<typeof assistantToolArgumentsSchema>;

const rawAssistantPlanSchema = z.object({
  action: z.enum(['tool_call', 'clarify']),
  toolName: z.union([z.enum(assistantToolNames), z.literal('none')]).optional().nullable(),
  arguments: assistantToolArgumentsSchema.partial().optional().nullable(),
  clarificationQuestion: z.string().trim().max(180).optional().nullable()
});

export type AssistantPlan =
  | {
      action: 'tool_call';
      toolName: AssistantToolName;
      arguments: AssistantToolArguments;
    }
  | {
      action: 'clarify';
      question: string;
    };

export const assistantPlanJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    action: {
      type: 'string',
      enum: ['tool_call', 'clarify'],
      description: 'tool_call per usare uno strumento interno, clarify per chiedere una sola domanda.'
    },
    toolName: {
      type: 'string',
      enum: [...assistantToolNames, 'none'],
      description: 'Nome dello strumento interno whitelist oppure none se serve chiarimento.'
    },
    arguments: {
      type: 'object',
      additionalProperties: false,
      properties: {
        plate: { type: ['string', 'null'], description: 'Targa normalizzata se presente, es. ZZ101ZZ.' },
        documentTypeName: { type: ['string', 'null'], description: 'Nome o famiglia documento, es. Assicurazione.' },
        status: { type: ['string', 'null'], enum: [...assistantSearchStatuses, null] },
        withinDays: { type: ['integer', 'null'], minimum: 1, maximum: 365 },
        missingPdf: { type: ['boolean', 'null'] },
        entityType: { type: ['string', 'null'], enum: [...assistantEntityTypes, null] },
        query: { type: ['string', 'null'], description: 'Testo libero breve per cercare viaggi o manutenzioni.' },
        tripStatus: { type: ['string', 'null'], enum: [...assistantTripStatuses, null] },
        maintenanceStatus: { type: ['string', 'null'], enum: [...assistantMaintenanceStatuses, null] },
        maintenanceCategoryName: { type: ['string', 'null'], description: 'Categoria manutenzione, es. Pneumatici, Assali, Carrozzeria.' },
        warehouseStatus: { type: ['string', 'null'], enum: [...assistantWarehouseStatuses, null] },
        warehouseCategoryName: { type: ['string', 'null'], description: 'Categoria magazzino, es. Ricambi, Pneumatici, Olio.' },
        location: { type: ['string', 'null'], description: 'Ubicazione magazzino, es. scaffale A o deposito gomme.' },
        supplierName: { type: ['string', 'null'], description: 'Nome fornitore/officina per manutenzioni o magazzino.' },
        fuelSupplierName: { type: ['string', 'null'], description: 'Circuito/distributore carburante, es. FuelCo, Eni, IP.' },
        fuelCardNumber: { type: ['string', 'null'], description: 'Numero tessera carburante.' },
        fuelProductName: { type: ['string', 'null'], description: 'Prodotto rifornimento, es. Gasolio, AdBlue, HVO.' },
        fuelNeedsReview: { type: ['boolean', 'null'], description: 'true per anomalie km o rifornimenti da verificare.' },
        tollCardNumber: { type: ['string', 'null'], description: 'Numero tessera autostrade/Telepass/FAI.' },
        tollNeedsReview: { type: ['boolean', 'null'], description: 'true per pedaggi o tessere autostrade da verificare.' },
        costSource: { type: ['string', 'null'], enum: [...assistantCostSources, null], description: 'Tipo costo nel centro costi.' },
        costCategoryName: { type: ['string', 'null'], description: 'Categoria costo, es. Pedaggi autostradali, Gasolio, Pneumatici.' },
        includeInternal: { type: ['boolean', 'null'], description: 'true per includere anche attribuzioni interne da magazzino.' },
        rankMetric: {
          type: ['string', 'null'],
          enum: [...assistantRankMetrics, null],
          description: 'Metrica per classifiche/anomalie: spend=spesa, count=numero movimenti, consumption=consumo L/100km, costPerKm=costo per km.'
        },
        rankDirection: {
          type: ['string', 'null'],
          enum: [...assistantRankDirections, null],
          description: 'top=valore più alto/peggiore o peggiorati; bottom=valore più basso/migliore o migliorati.'
        },
        plates: { type: ['array', 'null'], items: { type: 'string' }, description: 'Due o più targhe da confrontare.' }
      }
    },
    clarificationQuestion: {
      type: ['string', 'null'],
      description: 'Una sola domanda breve in italiano se la richiesta e ambigua.'
    }
  },
  required: ['action', 'toolName', 'arguments', 'clarificationQuestion']
} as const;

const toolDescriptions = [
  'searchDocuments({ plate, documentTypeName, status, withinDays, missingPdf, entityType }) cerca documenti e scadenze filtrate.',
  'getVehicleChecklist({ plate }) controlla documenti inseriti, mancanti e non richiesti per una targa.',
  'getExpiringSummary({ withinDays }) riepiloga tutte le scadenze attive entro N giorni.',
  'getMissingPdfSummary() riepiloga documenti attivi senza PDF.',
  'searchTrips({ query, plate, tripStatus, withinDays }) cerca viaggi per targa, numero, autista, punto vendita, prodotto o stato.',
  'getTripsSummary() riepiloga i viaggi per stato.',
  'searchFuelEntries({ query, plate, fuelSupplierName, fuelCardNumber, fuelProductName, fuelNeedsReview, withinDays }) cerca rifornimenti per targa, autista, distributore, tessera, prodotto o anomalie km.',
  'getFuelSummary() riepiloga costi, litri, km, euro/km e anomalie rifornimenti.',
  'searchTollEntries({ query, plate, tollCardNumber, tollNeedsReview, withinDays }) cerca pedaggi/autostrade per targa, tessera, tratta, casello o avvisi.',
  'getTollSummary() riepiloga costi autostrade, pedaggi, tessere e righe da verificare.',
  'searchCosts({ query, plate, costSource, costCategoryName, withinDays, includeInternal }) cerca nel centro costi aggregato.',
  'getCostSummary({ includeInternal }) riepiloga il centro costi aggregato.',
  'searchMaintenances({ query, plate, maintenanceStatus, maintenanceCategoryName, supplierName, missingPdf, withinDays }) cerca manutenzioni per targa, fornitore, intervento, stato, categoria o PDF.',
  'getMaintenanceSummary() riepiloga le manutenzioni per stato e PDF mancanti.',
  'searchWarehouse({ query, warehouseStatus, warehouseCategoryName, supplierName, location, missingPdf }) cerca magazzino per materiale, categoria, fornitore, ubicazione, stato o PDF.',
  'getWarehouseSummary() riepiloga il magazzino per disponibilita, scorte basse, esauriti e PDF mancanti.',
  'rankVehicleCosts({ rankMetric, rankDirection, costSource, costCategoryName, withinDays }) classifica le targhe per spesa (rankMetric=spend) o numero movimenti (rankMetric=count); costSource limita al modulo (FUEL, TOLLS, MAINTENANCE, EXPENSE, WAREHOUSE). Es. "chi ha speso di più in pedaggi", "chi ha fatto più rifornimenti".',
  'compareVehicleCosts({ plates, costSource, withinDays }) confronta due o più targhe e scompone la spesa per modulo.',
  'getVehicleCostTrend({ rankDirection, costSource, withinDays }) confronta il periodo con quello precedente di pari durata: rankDirection=top per i mezzi peggiorati, bottom per i migliorati. Es. "chi è peggiorato rispetto al mese scorso".',
  'rankFuelEfficiency({ rankMetric, rankDirection, withinDays }) classifica le targhe per consumo medio (rankMetric=consumption) o costo per km (rankMetric=costPerKm); rankDirection=top per i peggiori. Es. "classifica per consumo medio".',
  'analyzeFuelAnomalies({ rankMetric, withinDays }) trova i mezzi con consumo (rankMetric=consumption) o costo per km (rankMetric=costPerKm) statisticamente anomalo rispetto alla flotta. Es. "quali mezzi hanno consumi anomali".'
].join('\n');

const examples = [
  {
    user: 'fammi vedere assicurazioni in scadenza',
    json: {
      action: 'tool_call',
      toolName: 'searchDocuments',
      arguments: { documentTypeName: 'Assicurazione', status: 'expiring', withinDays: 30 },
      clarificationQuestion: null
    }
  },
  {
    user: 'documenti in scadenza per ZZ101ZZ',
    json: {
      action: 'tool_call',
      toolName: 'searchDocuments',
      arguments: { plate: 'ZZ101ZZ', status: 'expiring', withinDays: 30 },
      clarificationQuestion: null
    }
  },
  {
    user: 'quali documenti senza PDF abbiamo?',
    json: {
      action: 'tool_call',
      toolName: 'getMissingPdfSummary',
      arguments: {},
      clarificationQuestion: null
    }
  },
  {
    user: 'che manca sulla targa XA123XX?',
    json: {
      action: 'tool_call',
      toolName: 'getVehicleChecklist',
      arguments: { plate: 'XA123XX' },
      clarificationQuestion: null
    }
  },
  {
    user: 'scadenze entro 30 giorni dei semirimorchi',
    json: {
      action: 'tool_call',
      toolName: 'searchDocuments',
      arguments: { status: 'expiring', withinDays: 30, entityType: 'TRAILER' },
      clarificationQuestion: null
    }
  },
  {
    user: 'viaggi pianificati per ZZ101ZZ',
    json: {
      action: 'tool_call',
      toolName: 'searchTrips',
      arguments: { plate: 'ZZ101ZZ', tripStatus: 'PLANNED' },
      clarificationQuestion: null
    }
  },
  {
    user: 'manutenzioni senza pdf',
    json: {
      action: 'tool_call',
      toolName: 'searchMaintenances',
      arguments: { missingPdf: true },
      clarificationQuestion: null
    }
  },
  {
    user: 'rifornimenti FuelCo per ZZ101ZZ',
    json: {
      action: 'tool_call',
      toolName: 'searchFuelEntries',
      arguments: { plate: 'ZZ101ZZ', fuelSupplierName: 'FuelCo' },
      clarificationQuestion: null
    }
  },
  {
    user: 'pedaggi autostradali per ZZ103ZZ',
    json: {
      action: 'tool_call',
      toolName: 'searchTollEntries',
      arguments: { plate: 'ZZ103ZZ' },
      clarificationQuestion: null
    }
  },
  {
    user: 'quanto abbiamo speso in totale per ZZ101ZZ?',
    json: {
      action: 'tool_call',
      toolName: 'searchCosts',
      arguments: { plate: 'ZZ101ZZ', includeInternal: true },
      clarificationQuestion: null
    }
  },
  {
    user: 'centro costi autostrade ultimo mese',
    json: {
      action: 'tool_call',
      toolName: 'searchCosts',
      arguments: { costSource: 'TOLLS', withinDays: 30, includeInternal: true },
      clarificationQuestion: null
    }
  },
  {
    user: 'magazzino pneumatici senza pdf',
    json: {
      action: 'tool_call',
      toolName: 'searchWarehouse',
      arguments: { warehouseCategoryName: 'Pneumatici', missingPdf: true },
      clarificationQuestion: null
    }
  },
  {
    user: 'chi ha fatto più rifornimenti negli ultimi 90 giorni?',
    json: {
      action: 'tool_call',
      toolName: 'rankVehicleCosts',
      arguments: { rankMetric: 'count', rankDirection: 'top', costSource: 'FUEL', withinDays: 90 },
      clarificationQuestion: null
    }
  },
  {
    user: 'chi spende di più in pedaggi?',
    json: {
      action: 'tool_call',
      toolName: 'rankVehicleCosts',
      arguments: { rankMetric: 'spend', rankDirection: 'top', costSource: 'TOLLS' },
      clarificationQuestion: null
    }
  },
  {
    user: 'classifica camion per consumo medio',
    json: {
      action: 'tool_call',
      toolName: 'rankFuelEfficiency',
      arguments: { rankMetric: 'consumption', rankDirection: 'top' },
      clarificationQuestion: null
    }
  },
  {
    user: 'quali mezzi hanno consumi anomali?',
    json: {
      action: 'tool_call',
      toolName: 'analyzeFuelAnomalies',
      arguments: { rankMetric: 'consumption' },
      clarificationQuestion: null
    }
  },
  {
    user: 'confronta ZZ101ZZ e ZZ103ZZ negli ultimi 6 mesi',
    json: {
      action: 'tool_call',
      toolName: 'compareVehicleCosts',
      arguments: { plates: ['ZZ101ZZ', 'ZZ103ZZ'], withinDays: 180 },
      clarificationQuestion: null
    }
  },
  {
    user: 'chi è peggiorato rispetto al mese precedente?',
    json: {
      action: 'tool_call',
      toolName: 'getVehicleCostTrend',
      arguments: { rankDirection: 'top', withinDays: 30 },
      clarificationQuestion: null
    }
  }
]
  .map((example) => `Utente: ${example.user}\nJSON: ${JSON.stringify(example.json)}`)
  .join('\n\n');

export function buildAssistantPlannerMessages(message: string, history: AssistantConversationMessage[] = []) {
  const trimmedHistory = history
    .slice(-6)
    .map((entry) => `${entry.role === 'user' ? 'Utente' : 'Assistente'}: ${entry.content.slice(0, 500)}`)
    .join('\n');

  return [
    {
      role: 'system',
      content: [
        '/no_think',
        'Sei un planner per un archivio documenti mezzi/autisti, viaggi, rifornimenti, autostrade, centro costi, manutenzioni e magazzino. Devi scegliere solo uno strumento interno whitelist oppure una sola domanda di chiarimento.',
        'Non ragionare a lungo e non includere tag <think>.',
        'Non generare SQL, codice, filtri arbitrari o testo libero. Non inventare dati.',
        'Rispondi esclusivamente con JSON valido aderente allo schema richiesto.',
        'Lingua: italiano.',
        '',
        'Strumenti disponibili:',
        toolDescriptions,
        '',
        'Regole:',
        '- Usa getVehicleChecklist quando la domanda chiede cosa manca su una targa.',
        '- Usa getMissingPdfSummary per PDF mancanti/senza allegato.',
        '- Usa getExpiringSummary per riepiloghi generali di scadenze senza altri filtri.',
        '- Usa searchDocuments per targa, tipo documento, stato, categoria entita o combinazioni.',
        '- Usa searchTrips o getTripsSummary quando la domanda parla di viaggi, fogli viaggio, carichi, scarichi, punti vendita o litri.',
        '- Usa searchFuelEntries o getFuelSummary quando la domanda parla di rifornimenti, carburante, gasolio, tessere carburante, FuelCo, consumi, anomalie km o euro/km.',
        '- Usa searchTollEntries o getTollSummary quando la domanda parla di autostrade, pedaggi, Telepass, FAI o tessere autostrade.',
        '- Usa searchCosts o getCostSummary quando la domanda parla di centro costi, costi totali, spese complessive o confronto costi tra categorie/moduli.',
        '- Usa searchMaintenances o getMaintenanceSummary quando la domanda parla di manutenzioni, officina, ricambi, riparazioni, DDT manutenzione o fatture manutenzione.',
        '- Usa searchWarehouse o getWarehouseSummary quando la domanda parla di magazzino, stock, scorte, giacenze, ubicazione o materiale stoccato.',
        '- Usa rankVehicleCosts per classifiche tra mezzi (chi ha speso/fatto di più o di meno); imposta costSource al modulo citato (FUEL, TOLLS, MAINTENANCE) e rankMetric=count se si parla di numero/quante volte.',
        '- Usa rankFuelEfficiency per classifiche di consumo medio o costo per km; analyzeFuelAnomalies per mezzi con consumi anomali/fuori norma.',
        '- Usa compareVehicleCosts quando si confrontano due o più targhe; getVehicleCostTrend per peggioramenti/miglioramenti rispetto al periodo precedente.',
        '- Se manca un dato indispensabile, action=clarify con una sola domanda breve.',
        '- Per "in scadenza" usa status=expiring e withinDays=30 se non viene indicato un numero.',
        '',
        'Esempi:',
        examples
      ].join('\n')
    },
    {
      role: 'user',
      content: [trimmedHistory ? `Contesto recente:\n${trimmedHistory}\n` : '', `Domanda corrente: ${message}`].join('\n')
    }
  ] as const;
}

export function normalizeAssistantPlate(plate: string | null | undefined): string | undefined {
  const normalized = (plate || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return normalized || undefined;
}

function stripJsonNoise(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function normalizeAssistantPlan(rawPlan: z.infer<typeof rawAssistantPlanSchema>): AssistantPlan | null {
  if (rawPlan.action === 'clarify') {
    return {
      action: 'clarify',
      question: rawPlan.clarificationQuestion || 'Quale targa, scadenza o filtro vuoi controllare?'
    };
  }

  if (!rawPlan.toolName || rawPlan.toolName === 'none') return null;

  const parsedArguments = assistantToolArgumentsSchema.partial().safeParse(rawPlan.arguments || {});
  if (!parsedArguments.success) return null;

  const args = { ...parsedArguments.data };
  const plate = normalizeAssistantPlate(args.plate);
  if (plate) args.plate = plate;
  if (args.documentTypeName) args.documentTypeName = args.documentTypeName.trim();
  if (args.query) args.query = args.query.trim();
  if (args.maintenanceCategoryName) args.maintenanceCategoryName = args.maintenanceCategoryName.trim();
  if (args.warehouseCategoryName) args.warehouseCategoryName = args.warehouseCategoryName.trim();
  if (args.location) args.location = args.location.trim();
  if (args.supplierName) args.supplierName = args.supplierName.trim();
  if (args.fuelSupplierName) args.fuelSupplierName = args.fuelSupplierName.trim();
  if (args.fuelCardNumber) args.fuelCardNumber = args.fuelCardNumber.trim().replace(/\s+/g, '');
  if (args.fuelProductName) args.fuelProductName = args.fuelProductName.trim();
  if (args.tollCardNumber) args.tollCardNumber = args.tollCardNumber.trim().replace(/\s+/g, '');
  if (args.costCategoryName) args.costCategoryName = args.costCategoryName.trim();

  if (rawPlan.toolName === 'getVehicleChecklist' && !args.plate) {
    return { action: 'clarify', question: 'Per quale targa vuoi controllare i documenti mancanti?' };
  }

  if (rawPlan.toolName === 'getExpiringSummary' && !args.withinDays) {
    args.withinDays = 30;
  }

  return {
    action: 'tool_call',
    toolName: rawPlan.toolName,
    arguments: args
  };
}

export function parseAssistantPlanContent(content: string): AssistantPlan | null {
  try {
    const parsed = JSON.parse(stripJsonNoise(content));
    const rawPlan = rawAssistantPlanSchema.safeParse(parsed);
    if (!rawPlan.success) return null;
    return normalizeAssistantPlan(rawPlan.data);
  } catch {
    return null;
  }
}

function extractPlate(message: string): string | undefined {
  const match = message.toUpperCase().match(/\b[A-Z]{2}\s?\d{3}\s?[A-Z]{2}\b/);
  return normalizeAssistantPlate(match?.[0]);
}

function extractWithinDays(message: string): number | undefined {
  const match = message.match(/\b(?:entro|in|nei|prossimi)\s+(\d{1,3})\s+giorn/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 && value <= 365 ? value : undefined;
}

function detectEntityType(message: string): AssistantEntityType | undefined {
  if (/\b(semirimorchi|semirimorchio|rimorchi|rimorchio|trailer)\b/i.test(message)) return 'TRAILER';
  if (/\b(trattori|trattore|motrice|motrici)\b/i.test(message)) return 'TRACTOR';
  if (/\b(autisti|autista|driver|patenti|patente|cqc)\b/i.test(message)) return 'DRIVER';
  if (/\b(altro|altra entita|altre entita|porto|porti)\b/i.test(message)) return 'OTHER';
  return undefined;
}

function detectDocumentTypeName(message: string): string | undefined {
  if (/cronotachigraf/i.test(message)) return 'Revisione cronotachigrafo';
  if (/assicur/i.test(message)) return 'Assicurazione';
  if (/barrat[oi]\s+rosa|adr/i.test(message)) return 'Barrato rosa';
  if (/estintor/i.test(message)) return 'Estintori';
  if (/librett|revis/i.test(message)) return 'Libretto/Revisione';
  if (/patent/i.test(message)) return 'Patente';
  if (/\bcqc\b/i.test(message)) return 'CQC';
  if (/carta\s+tachigraf/i.test(message)) return 'Carta tachigrafica';
  if (/visita\s+medic/i.test(message)) return 'Visita medica';
  if (/permess/i.test(message)) return 'Permesso';
  return undefined;
}

function detectStatus(message: string): AssistantSearchStatus | undefined {
  if (/archiviat|rinnovat|inattiv/i.test(message)) return 'inactive';
  if (/scadut|scadute|scaduti/i.test(message)) return 'expired';
  if (/valid[ioe]/i.test(message)) return 'valid';
  if (/scadenz|in\s+scadenza|entro\s+\d{1,3}\s+giorn/i.test(message)) return 'expiring';
  return undefined;
}

function detectTripStatus(message: string): AssistantTripStatus | undefined {
  if (/annullat/i.test(message)) return 'CANCELLED';
  if (/completat|conclus/i.test(message)) return 'COMPLETED';
  if (/inviat|pdf\s+inviat/i.test(message)) return 'SENT';
  if (/pianificat|programm|da\s+fare|previst/i.test(message)) return 'PLANNED';
  return undefined;
}

function detectMaintenanceStatus(message: string): AssistantMaintenanceStatus | undefined {
  if (/archiviat/i.test(message)) return 'ARCHIVED';
  if (/fatturat/i.test(message)) return 'INVOICED';
  if (/completat|chius/i.test(message)) return 'COMPLETED';
  if (/lavorazione|in\s+corso/i.test(message)) return 'IN_PROGRESS';
  if (/apert|da\s+fare|preventiv/i.test(message)) return 'OPEN';
  return undefined;
}

function detectMaintenanceCategoryName(message: string): string | undefined {
  if (/pneumatic|gomma|gomme/i.test(message)) return 'Pneumatici';
  if (/assal/i.test(message)) return 'Assali';
  if (/carrozzer|parafang|cabina/i.test(message)) return 'Carrozzeria';
  if (/tagliand|olio|filtro|filtri/i.test(message)) return 'Tagliando';
  if (/ricamb|ddt|pezzi|spazzol|faro|fanale|lampad|disco/i.test(message)) return 'Ricambi';
  if (/elettric|batteria|alternator/i.test(message)) return 'Elettrico';
  if (/ripar|officina|radiator|ammortizz|soffiett/i.test(message)) return 'Riparazioni';
  return undefined;
}

function detectWarehouseStatus(message: string): AssistantWarehouseStatus | undefined {
  if (/archiviat/i.test(message)) return 'ARCHIVED';
  if (/esaurit|finito|finiti|zero|non\s+disponibil/i.test(message)) return 'OUT_OF_STOCK';
  if (/scort[ae]\s+bass|sotto\s+soglia|soglia\s+minima|pochi|poco/i.test(message)) return 'LOW_STOCK';
  if (/disponibil|in\s+stock|giacenz/i.test(message)) return 'IN_STOCK';
  return undefined;
}

function detectWarehouseCategoryName(message: string): string | undefined {
  if (/pneumatic|gomma|gomme/i.test(message)) return 'Pneumatici';
  if (/ricamb|pezzi|spazzol|faro|fanale|lampad|disco/i.test(message)) return 'Ricambi';
  if (/olio|lubrificant|grasso/i.test(message)) return 'Olio e lubrificanti';
  if (/filtro|filtri/i.test(message)) return 'Filtri';
  if (/elettric|batteria|alternator/i.test(message)) return 'Elettrico';
  if (/carrozzer|parafang|cabina/i.test(message)) return 'Carrozzeria';
  if (/dpi|guanti|caschi?|gilet|scarpe/i.test(message)) return 'DPI';
  return undefined;
}

function detectFuelProductName(message: string): string | undefined {
  if (/ad\s*blue|adblue|\badb\b/i.test(message)) return 'AdBlue';
  if (/\bhvo\b/i.test(message)) return 'HVO';
  if (/gasolio|diesel/i.test(message)) return 'Gasolio';
  if (/benzina|super/i.test(message)) return 'Benzina';
  if (/\bgpl\b/i.test(message)) return 'GPL';
  if (/metano|cng|lng/i.test(message)) return 'Metano';
  return undefined;
}

function detectFuelSupplierName(message: string): string | undefined {
  if (/\bfuelco\b/i.test(message)) return 'FuelCo';
  if (/\beni\b/i.test(message)) return 'Eni';
  if (/\bip\b/i.test(message)) return 'IP';
  return undefined;
}

function extractFuelCardNumber(message: string): string | undefined {
  const match = message.match(/\b(?:tessera|carta)\s+(\d{8,24})\b/i);
  return match?.[1];
}

function extractTollCardNumber(message: string): string | undefined {
  const match = message.match(/\b(?:tessera|carta|telepass)\s+(\d{8,24})\b/i);
  return match?.[1];
}

function detectCostSource(message: string): AssistantCostSource | undefined {
  if (/container|lettera\s+di\s+vettura|\bldv\b|booking|transitario/i.test(message)) return 'CONTAINER_TRIPS';
  if (/viaggi|trasporti|trasporto|foglio viaggio/i.test(message)) return 'TRIPS';
  if (/autostrade|pedaggi?|telepass|\bfai\b/i.test(message)) return 'TOLLS';
  if (/rifornimenti?|carburante|gasolio|diesel|ad\s*blue|adblue|hvo|fuelco/i.test(message)) return 'FUEL';
  if (/montaggi?|montat[io]|scaric[ao]\s+magazzino/i.test(message)) return 'WAREHOUSE_MOUNT';
  if (/magazzino|stock|giacenz/i.test(message)) return 'WAREHOUSE';
  if (/fatture?|ddt|ricambi|document[oi]\s+di\s+spesa/i.test(message)) return 'EXPENSE';
  if (/estintor|document[oi]\s+flotta|scadenz/i.test(message)) return 'DOCUMENT';
  if (/manutenzioni?|officin|riparazioni?|tagliand/i.test(message)) return 'MAINTENANCE';
  return undefined;
}

function detectCostCategoryName(message: string): string | undefined {
  if (/autostrade|pedaggi?|telepass|\bfai\b/i.test(message)) return 'Pedaggi autostradali';
  return detectFuelProductName(message) || detectMaintenanceCategoryName(message) || detectWarehouseCategoryName(message);
}

function messageMentionsTrips(message: string): boolean {
  return /\b(viaggi?|foglio\s+viaggio|carichi?|scarichi?|litri|punto\s+vendita|impianto|base\s+di\s+carico)\b/i.test(message);
}

function messageMentionsFuel(message: string): boolean {
  return /\b(rifornimenti?|carburante|gasolio|diesel|ad\s*blue|adblue|hvo|tessere?|fuelco|consumi?|euro\/km|€\/km|km\/l|litri\/100)\b/i.test(message);
}

function messageMentionsTolls(message: string): boolean {
  return /\b(autostrade?|pedaggi?|casell[oi]|telepass|\bfai\b|viacard)\b/i.test(message);
}

function messageMentionsCosts(message: string): boolean {
  return /\b(centro\s+costi?|costi?|spese?|quanto\s+(?:abbiamo\s+)?speso|totale\s+costi?|costi\s+totali|spesa\s+totale)\b/i.test(message);
}

function messageMentionsWarehouse(message: string): boolean {
  return /\b(magazzino|stock|scort[ae]|giacenz[ae]|deposito|stoccat[ioe]|materiale|articoli?|sku|ubicazion[ei]|scaffal[ei])\b/i.test(message);
}

function messageMentionsMaintenances(message: string): boolean {
  return /\b(manutenzioni?|officine?|fornitor[ei]|riparazioni?|ricambi?|fatture?|ddt|scheda\s+di\s+riparazione|preventivi?|tagliandi?|pneumatici?|gomme)\b/i.test(message);
}

function cleanDomainQuery(message: string, domain: 'trips' | 'fuel' | 'tolls' | 'costs' | 'maintenances' | 'warehouse'): string | undefined {
  const commonWords =
    /\b(fammi|vedere|mostra|cerca|trova|lista|elenco|quali|qual[ei]|situazione|riepilogo|riepilogami|per|del|della|delle|dei|di|con|senza|pdf|allegati?|abbiamo|ho|sono|tutti|tutte)\b/gi;
  const domainWords = {
    trips: /\b(viaggi?|fogli? viaggio|carichi?|scarichi?|pianificati?|programmati?|completati?|annullati?|inviati?|litri|impianto|punto vendita|base di carico)\b/gi,
    maintenances: /\b(manutenzioni?|officine?|fornitor[ei]|riparazioni?|ricambi?|fatture?|ddt|scheda di riparazione|preventivi?|tagliandi?|pneumatici?|gomme|completate?|fatturate?|archiviate?|aperte?|da fare|in lavorazione)\b/gi,
    fuel: /\b(rifornimenti?|carburante|gasolio|diesel|ad\s*blue|adblue|hvo|tessere?|carta|fuelco|consumi?|euro\/km|€\/km|km\/l|litri\/100|anomalie|anomali|verificare|verificati)\b/gi,
    tolls: /\b(autostrade?|pedaggi?|casell[oi]|telepass|\bfai\b|viacard|tessere?|carta|tratta|tratte|verificare|verificati)\b/gi,
    costs: /\b(centro costi?|costi?|spese?|totale|totali|quanto|speso|contabile|contabili|attribuzioni?|interne?|categoria|categorie)\b/gi,
    warehouse: /\b(magazzino|stock|scort[ae]|giacenz[ae]|deposito|stoccat[ioe]|materiale|articoli?|sku|ubicazion[ei]|scaffal[ei]|disponibili?|esauriti?|sotto soglia|scorta bassa)\b/gi
  }[domain];
  const cleaned = message
    .replace(commonWords, ' ')
    .replace(domainWords, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || undefined;
}

function extractAllPlates(message: string): string[] {
  const matches = message.toUpperCase().match(/\b[A-Z]{2}\s?\d{3}\s?[A-Z]{2}\b/g) || [];
  const plates = matches.map((match) => normalizeAssistantPlate(match)).filter((plate): plate is string => Boolean(plate));
  return [...new Set(plates)];
}

function wordToNumber(token: string): number | null {
  const map: Record<string, number> = {
    un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12
  };
  if (/^\d{1,3}$/.test(token)) return Number(token);
  return map[token] ?? null;
}

// Finestra temporale per le analisi: oltre ai "giorni", capisce mese/settimana/anno,
// trimestre/semestre e numeri a parole ("ultimi sei mesi").
function extractAnalyticsWindowDays(message: string): number | undefined {
  const direct = extractWithinDays(message);
  if (direct) return direct;
  const m = message.toLocaleLowerCase('it-IT');
  if (/\b(ultimo\s+mese|mese\s+(scorso|precedente|passato|corrente))\b/.test(m)) return 30;
  if (/\b(ultima\s+settimana|settimana\s+(scorsa|precedente))\b/.test(m)) return 7;
  if (/\b(ultimo\s+anno|anno\s+(scorso|precedente|passato))\b/.test(m)) return 365;
  if (/\btrimestre\b/.test(m)) return 90;
  if (/\bsemestre\b/.test(m)) return 180;
  const num = '(\\d{1,3}|un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici)';
  const giorni = m.match(new RegExp(`\\b${num}\\s+giorn[oi]\\b`));
  if (giorni) {
    const n = wordToNumber(giorni[1]);
    if (n) return Math.min(365, n);
  }
  const mesi = m.match(new RegExp(`\\b${num}\\s+mes[ei]\\b`));
  if (mesi) {
    const n = wordToNumber(mesi[1]);
    if (n) return Math.min(365, n * 30);
  }
  const settimane = m.match(new RegExp(`\\b${num}\\s+settiman[ae]\\b`));
  if (settimane) {
    const n = wordToNumber(settimane[1]);
    if (n) return Math.min(365, n * 7);
  }
  if (new RegExp(`\\b${num}\\s+ann[oi]\\b`).test(m)) return 365;
  return undefined;
}

// Gli accenti (es. "più") spezzano \b in JS perche' la "ù" non e' un carattere ASCII di
// parola: normalizziamo via NFD togliendo i diacritici prima del riconoscimento intenti.
function deaccentLower(value: string): string {
  return value
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function mentionsAnomalyIntent(message: string): boolean {
  return /\b(anomal\w*|fuori\s+(norma|media|soglia)|stran[oi]|sospett\w*|spropositat\w*|insolit\w*|eccessiv\w*)\b/.test(
    deaccentLower(message)
  );
}

function mentionsTrendIntent(message: string): boolean {
  return /\b(peggiorat\w*|miglior(?:at|ament)\w*|aument\w*|diminuit\w*|cresci\w*|cal[oat]\w*|andament\w*|trend|salit\w*|sces\w*|rispetto\s+al\s+(mese|periodo)\s+(scors\w*|precedent\w*|passat\w*))\b/.test(
    deaccentLower(message)
  );
}

function mentionsComparisonIntent(message: string): boolean {
  return /\b(confront\w*|paragon\w*|differenz[ae]\s+tra|vs|contro)\b/.test(deaccentLower(message));
}

// Una domanda e' una classifica se chiede QUALE mezzo + un superlativo/comparativo.
function mentionsRankingIntent(message: string): boolean {
  const m = deaccentLower(message);
  const subject = /\b(chi|qual[ei]|classifica|graduatoria|top|camion|mezz[oi]|trattor[ei]|targh[ei]|veicol[oi]|flotta)\b/.test(m);
  const cue = /\b(classifica|graduatoria|top|piu|maggior\w*|meno|minor\w*|peggior\w*|miglior\w*)\b/.test(m);
  return subject && cue;
}

function mentionsFuelPhysicalMetric(message: string): boolean {
  return /\b(consum\w*|l\/100|litri\/100|km\/l|euro\/km|€\/km|per\s+km|al\s+km|costo\s*\/?\s*km)\b/.test(deaccentLower(message));
}

function isCostPerKmMetric(message: string): boolean {
  return /\b(euro\/km|€\/km|per\s+km|al\s+km|costo\s*\/?\s*km|carburante\s+per\s+km)\b/.test(deaccentLower(message));
}

function detectRankDirection(message: string): AssistantRankDirection {
  if (/\b(meno|minor\w*|piu\s+bass\w*|miglior\w*|efficient\w*|piu\s+ridott\w*|piu\s+econom\w*)\b/.test(deaccentLower(message))) {
    return 'bottom';
  }
  return 'top';
}

// Riconosce localmente (senza LLM) le domande evolute: anomalie, trend, confronti, classifiche.
function detectFleetAnalyticsPlan(message: string): AssistantPlan | null {
  const plates = extractAllPlates(message);
  const withinDays = extractAnalyticsWindowDays(message);
  const costSource = detectCostSource(message);
  const fuelPhysical = mentionsFuelPhysicalMetric(message);
  const byCost = isCostPerKmMetric(message);

  // 1) Anomalie: solo dominio carburante (le metriche fisiche esistono solo li').
  if (mentionsAnomalyIntent(message) && (messageMentionsFuel(message) || fuelPhysical)) {
    return {
      action: 'tool_call',
      toolName: 'analyzeFuelAnomalies',
      arguments: { rankMetric: byCost ? 'costPerKm' : 'consumption', ...(withinDays ? { withinDays } : {}) }
    };
  }

  // 2) Trend: peggioramenti/miglioramenti rispetto al periodo precedente.
  if (mentionsTrendIntent(message)) {
    const direction: AssistantRankDirection = /\b(miglior\w*|diminuit\w*|cal[oat]\w*|sces\w*|ridott\w*)\b/i.test(message)
      ? 'bottom'
      : 'top';
    return {
      action: 'tool_call',
      toolName: 'getVehicleCostTrend',
      arguments: { rankDirection: direction, ...(costSource ? { costSource } : {}), ...(withinDays ? { withinDays } : {}) }
    };
  }

  // 3) Confronto: richiesta esplicita di confronto, oppure due+ targhe con un contesto
  // di costo/consumo (cosi' "documenti A e B" non diventa per errore un confronto spese).
  const hasCostContext =
    Boolean(costSource) ||
    fuelPhysical ||
    messageMentionsCosts(message) ||
    messageMentionsFuel(message) ||
    messageMentionsTolls(message) ||
    messageMentionsMaintenances(message) ||
    /\b(spes[ae]|spend\w*|costo|cost[ai])\b/i.test(message);
  if ((mentionsComparisonIntent(message) && plates.length >= 1) || (plates.length >= 2 && hasCostContext)) {
    return {
      action: 'tool_call',
      toolName: 'compareVehicleCosts',
      arguments: { plates, ...(costSource ? { costSource } : {}), ...(withinDays ? { withinDays } : {}) }
    };
  }

  // 4) Classifiche.
  if (mentionsRankingIntent(message)) {
    const direction = detectRankDirection(message);
    if (fuelPhysical) {
      return {
        action: 'tool_call',
        toolName: 'rankFuelEfficiency',
        arguments: { rankMetric: byCost ? 'costPerKm' : 'consumption', rankDirection: direction, ...(withinDays ? { withinDays } : {}) }
      };
    }
    const byCount =
      /\b(numero|quant[ei]|quante\s+volte|più\s+volte|più\s+spesso)\b/i.test(message) ||
      (/\b(fatto|fatti|fanno|effettuat\w*)\b/i.test(message) && !/\b(spes[oae]|spend\w*|costo|cost[ai])\b/i.test(message));
    return {
      action: 'tool_call',
      toolName: 'rankVehicleCosts',
      arguments: {
        rankMetric: byCount ? 'count' : 'spend',
        rankDirection: direction,
        ...(costSource ? { costSource } : {}),
        ...(withinDays ? { withinDays } : {})
      }
    };
  }

  return null;
}

export function selectAssistantPlanHeuristic(message: string): AssistantPlan {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length < 4) {
    return { action: 'clarify', question: 'Quale targa, scadenza o filtro vuoi controllare?' };
  }

  // Le domande evolute (classifiche, confronti, anomalie, trend) hanno priorita':
  // altrimenti i blocchi per-dominio le degraderebbero in semplice ricerca testuale.
  const analyticsPlan = detectFleetAnalyticsPlan(trimmed);
  if (analyticsPlan) return analyticsPlan;

  const plate = extractPlate(trimmed);
  const withinDays = extractWithinDays(trimmed);
  const entityType = detectEntityType(trimmed);
  const status = detectStatus(trimmed);
  const documentTypeName = detectDocumentTypeName(trimmed);
  const missingPdf = /\b(pdf|allegat[oi])\b/i.test(trimmed) && /\b(manc|senza|assent|non\s+presente)\b/i.test(trimmed);
  const mentionsTrips = messageMentionsTrips(trimmed);
  const mentionsFuel = messageMentionsFuel(trimmed);
  const mentionsTolls = messageMentionsTolls(trimmed);
  const mentionsCosts = messageMentionsCosts(trimmed);
  const mentionsWarehouse = messageMentionsWarehouse(trimmed);
  const mentionsMaintenances = messageMentionsMaintenances(trimmed);

  if (mentionsCosts) {
    const costSource = detectCostSource(trimmed);
    const costCategoryName = detectCostCategoryName(trimmed);
    const includeInternal = !/\b(solo\s+contabil|contabil[ei]|senza\s+attribuzioni?|escludi\s+intern[ei])\b/i.test(trimmed);
    if (!plate && !costSource && !costCategoryName && !withinDays && /\b(riepilog\w*|situazione|totale|totali|quanto)\b/i.test(trimmed)) {
      return { action: 'tool_call', toolName: 'getCostSummary', arguments: { includeInternal } };
    }
    return {
      action: 'tool_call',
      toolName: 'searchCosts',
      arguments: {
        ...(plate ? { plate } : {}),
        ...(costSource ? { costSource } : {}),
        ...(costCategoryName ? { costCategoryName } : {}),
        ...(withinDays ? { withinDays } : {}),
        includeInternal,
        ...(!plate && !costSource && !costCategoryName && !withinDays ? { query: cleanDomainQuery(trimmed, 'costs') } : {})
      }
    };
  }

  if (mentionsTolls && !mentionsTrips) {
    const tollCardNumber = extractTollCardNumber(trimmed);
    const tollNeedsReview = /\b(verific\w*|controll\w*|sbagliat\w*|errore|errori|anomali\w*)\b/i.test(trimmed);
    if (!plate && !tollCardNumber && !tollNeedsReview && /\b(riepilog\w*|situazione|quanto|costi?|spes[ae]|totale)\b/i.test(trimmed)) {
      return { action: 'tool_call', toolName: 'getTollSummary', arguments: {} };
    }
    return {
      action: 'tool_call',
      toolName: 'searchTollEntries',
      arguments: {
        ...(plate ? { plate } : {}),
        ...(tollCardNumber ? { tollCardNumber } : {}),
        ...(tollNeedsReview ? { tollNeedsReview: true } : {}),
        ...(withinDays ? { withinDays } : {}),
        ...(!plate && !tollCardNumber && !tollNeedsReview && !withinDays ? { query: cleanDomainQuery(trimmed, 'tolls') } : {})
      }
    };
  }

  if (mentionsFuel && !/\bviaggi?\b/i.test(trimmed)) {
    const fuelSupplierName = detectFuelSupplierName(trimmed);
    const fuelProductName = detectFuelProductName(trimmed);
    const fuelCardNumber = extractFuelCardNumber(trimmed);
    const fuelNeedsReview = /\b(anomal\w*|verific\w*|controll\w*|sbagliat\w*|errore|errori|km)\b/i.test(trimmed) && /\b(anomal\w*|verific\w*|sbagliat\w*|errore|errori)\b/i.test(trimmed);
    if (!plate && !fuelSupplierName && !fuelProductName && !fuelCardNumber && !fuelNeedsReview && /\b(riepilog\w*|situazione|quanto|costi?|consumi?|media)\b/i.test(trimmed)) {
      return { action: 'tool_call', toolName: 'getFuelSummary', arguments: {} };
    }
    return {
      action: 'tool_call',
      toolName: 'searchFuelEntries',
      arguments: {
        ...(plate ? { plate } : {}),
        ...(fuelSupplierName ? { fuelSupplierName } : {}),
        ...(fuelProductName ? { fuelProductName } : {}),
        ...(fuelCardNumber ? { fuelCardNumber } : {}),
        ...(fuelNeedsReview ? { fuelNeedsReview: true } : {}),
        ...(withinDays ? { withinDays } : {}),
        ...(!plate && !fuelSupplierName && !fuelProductName && !fuelCardNumber && !fuelNeedsReview && !withinDays
          ? { query: cleanDomainQuery(trimmed, 'fuel') }
          : {})
      }
    };
  }

  if (mentionsTrips) {
    const tripStatus = detectTripStatus(trimmed);
    if (!plate && !tripStatus && !/\b(cerca|trova|mostra|vedere|lista|elenco|quali|riepilog|situazione)\b/i.test(trimmed)) {
      return { action: 'tool_call', toolName: 'getTripsSummary', arguments: {} };
    }
    return {
      action: 'tool_call',
      toolName: 'searchTrips',
      arguments: {
        ...(plate ? { plate } : {}),
        ...(tripStatus ? { tripStatus } : {}),
        ...(withinDays ? { withinDays } : {}),
        ...(!plate && !tripStatus && !withinDays ? { query: cleanDomainQuery(trimmed, 'trips') } : {})
      }
    };
  }

  if (mentionsWarehouse) {
    const warehouseStatus = detectWarehouseStatus(trimmed);
    const warehouseCategoryName = detectWarehouseCategoryName(trimmed);
    if (!warehouseStatus && !warehouseCategoryName && !missingPdf && /\b(riepilog\w*|situazione|quante|conteggio)\b/i.test(trimmed)) {
      return { action: 'tool_call', toolName: 'getWarehouseSummary', arguments: {} };
    }
    return {
      action: 'tool_call',
      toolName: 'searchWarehouse',
      arguments: {
        ...(warehouseStatus ? { warehouseStatus } : {}),
        ...(warehouseCategoryName ? { warehouseCategoryName } : {}),
        ...(missingPdf ? { missingPdf: true } : {}),
        ...(!warehouseStatus && !warehouseCategoryName && !missingPdf ? { query: cleanDomainQuery(trimmed, 'warehouse') } : {})
      }
    };
  }

  if (mentionsMaintenances) {
    const maintenanceStatus = detectMaintenanceStatus(trimmed);
    const maintenanceCategoryName = detectMaintenanceCategoryName(trimmed);
    if (!plate && !maintenanceStatus && !maintenanceCategoryName && !missingPdf && /\b(riepilog\w*|situazione|quante|conteggio)\b/i.test(trimmed)) {
      return { action: 'tool_call', toolName: 'getMaintenanceSummary', arguments: {} };
    }
    return {
      action: 'tool_call',
      toolName: 'searchMaintenances',
      arguments: {
        ...(plate ? { plate } : {}),
        ...(maintenanceStatus ? { maintenanceStatus } : {}),
        ...(maintenanceCategoryName ? { maintenanceCategoryName } : {}),
        ...(missingPdf ? { missingPdf: true } : {}),
        ...(withinDays ? { withinDays } : {}),
        ...(!plate && !maintenanceStatus && !maintenanceCategoryName && !missingPdf && !withinDays
          ? { query: cleanDomainQuery(trimmed, 'maintenances') }
          : {})
      }
    };
  }

  if (missingPdf && !plate && !documentTypeName && !entityType) {
    return { action: 'tool_call', toolName: 'getMissingPdfSummary', arguments: {} };
  }

  if (plate && /\b(manca|mancano|mancanti|checklist|richiest[oi])\b/i.test(trimmed)) {
    return { action: 'tool_call', toolName: 'getVehicleChecklist', arguments: { plate } };
  }

  if (!plate && !documentTypeName && !entityType && status === 'expiring') {
    return {
      action: 'tool_call',
      toolName: 'getExpiringSummary',
      arguments: { withinDays: withinDays || 30 }
    };
  }

  if (plate || documentTypeName || entityType || status || missingPdf) {
    return {
      action: 'tool_call',
      toolName: 'searchDocuments',
      arguments: {
        ...(plate ? { plate } : {}),
        ...(documentTypeName ? { documentTypeName } : {}),
        ...(status ? { status, withinDays: status === 'expiring' ? withinDays || 30 : withinDays } : withinDays ? { withinDays } : {}),
        ...(missingPdf ? { missingPdf: true } : {}),
        ...(entityType ? { entityType } : {})
      }
    };
  }

  return { action: 'clarify', question: 'Vuoi cercare per targa, scadenza, tipo documento o PDF mancanti?' };
}
