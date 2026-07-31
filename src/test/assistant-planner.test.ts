import { describe, expect, it } from 'vitest';
import { parseAssistantPlanContent, selectAssistantPlanHeuristic } from '@/lib/assistant-planner';

describe('assistant planner', () => {
  it('parses a structured tool call and normalizes the plate', () => {
    const plan = parseAssistantPlanContent(
      JSON.stringify({
        action: 'tool_call',
        toolName: 'searchDocuments',
        arguments: {
          plate: 'zz 101 zz',
          status: 'expiring',
          withinDays: 30
        },
        clarificationQuestion: null
      })
    );

    expect(plan).toEqual({
      action: 'tool_call',
      toolName: 'searchDocuments',
      arguments: {
        plate: 'ZZ101ZZ',
        status: 'expiring',
        withinDays: 30
      }
    });
  });

  it('turns an unsafe checklist call without plate into one clarification question', () => {
    const plan = parseAssistantPlanContent(
      JSON.stringify({
        action: 'tool_call',
        toolName: 'getVehicleChecklist',
        arguments: {},
        clarificationQuestion: null
      })
    );

    expect(plan).toEqual({
      action: 'clarify',
      question: 'Per quale targa vuoi controllare i documenti mancanti?'
    });
  });

  it('selects the missing PDF summary from natural Italian text', () => {
    expect(selectAssistantPlanHeuristic('quali documenti senza PDF abbiamo?')).toEqual({
      action: 'tool_call',
      toolName: 'getMissingPdfSummary',
      arguments: {}
    });
  });

  it('selects expiring insurance documents without waiting for the LLM', () => {
    expect(selectAssistantPlanHeuristic('fammi vedere assicurazioni in scadenza')).toEqual({
      action: 'tool_call',
      toolName: 'searchDocuments',
      arguments: {
        documentTypeName: 'Assicurazione',
        status: 'expiring',
        withinDays: 30
      }
    });
  });

  it('selects expiring documents for a plate without waiting for the LLM', () => {
    expect(selectAssistantPlanHeuristic('documenti in scadenza per ZZ101ZZ')).toEqual({
      action: 'tool_call',
      toolName: 'searchDocuments',
      arguments: {
        plate: 'ZZ101ZZ',
        status: 'expiring',
        withinDays: 30
      }
    });
  });

  it('selects the vehicle checklist when asking what is missing for a plate', () => {
    expect(selectAssistantPlanHeuristic('che manca sulla targa XA123XX?')).toEqual({
      action: 'tool_call',
      toolName: 'getVehicleChecklist',
      arguments: {
        plate: 'XA123XX'
      }
    });
  });

  it('selects trailer expiries within a custom window', () => {
    expect(selectAssistantPlanHeuristic('scadenze entro 30 giorni dei semirimorchi')).toEqual({
      action: 'tool_call',
      toolName: 'searchDocuments',
      arguments: {
        status: 'expiring',
        withinDays: 30,
        entityType: 'TRAILER'
      }
    });
  });

  it('selects trips without waiting for the LLM', () => {
    expect(selectAssistantPlanHeuristic('viaggi pianificati per ZZ101ZZ')).toEqual({
      action: 'tool_call',
      toolName: 'searchTrips',
      arguments: {
        plate: 'ZZ101ZZ',
        tripStatus: 'PLANNED'
      }
    });
  });

  it('selects fuel entries without waiting for the LLM', () => {
    expect(selectAssistantPlanHeuristic('rifornimenti FuelCo per ZZ101ZZ')).toEqual({
      action: 'tool_call',
      toolName: 'searchFuelEntries',
      arguments: {
        plate: 'ZZ101ZZ',
        fuelSupplierName: 'FuelCo'
      }
    });
  });

  it('selects fuel review filters without confusing trips', () => {
    expect(selectAssistantPlanHeuristic('rifornimenti da verificare')).toEqual({
      action: 'tool_call',
      toolName: 'searchFuelEntries',
      arguments: {
        fuelNeedsReview: true
      }
    });
  });

  it('selects maintenance filters without waiting for the LLM', () => {
    expect(selectAssistantPlanHeuristic('manutenzioni pneumatici senza pdf')).toEqual({
      action: 'tool_call',
      toolName: 'searchMaintenances',
      arguments: {
        maintenanceCategoryName: 'Pneumatici',
        missingPdf: true
      }
    });
  });

  it('keeps maintenance supplier searches lightweight and searchable', () => {
    expect(selectAssistantPlanHeuristic('manutenzioni fornitore DemoService')).toEqual({
      action: 'tool_call',
      toolName: 'searchMaintenances',
      arguments: {
        query: 'DemoService'
      }
    });
  });

  it('selects warehouse records without waiting for the LLM', () => {
    expect(selectAssistantPlanHeuristic('magazzino pneumatici senza pdf')).toEqual({
      action: 'tool_call',
      toolName: 'searchWarehouse',
      arguments: {
        warehouseCategoryName: 'Pneumatici',
        missingPdf: true
      }
    });
  });

  it('selects warehouse low-stock summary filters without confusing maintenances', () => {
    expect(selectAssistantPlanHeuristic('stock con scorta bassa')).toEqual({
      action: 'tool_call',
      toolName: 'searchWarehouse',
      arguments: {
        warehouseStatus: 'LOW_STOCK'
      }
    });
  });
});

describe('assistant planner - analisi flotta', () => {
  it('routes "chi ha fatto piu rifornimenti" to a fuel count ranking', () => {
    expect(selectAssistantPlanHeuristic('chi ha fatto più rifornimenti negli ultimi 90 giorni?')).toEqual({
      action: 'tool_call',
      toolName: 'rankVehicleCosts',
      arguments: { rankMetric: 'count', rankDirection: 'top', costSource: 'FUEL', withinDays: 90 }
    });
  });

  it('routes "chi ha speso di piu in pedaggi" to a toll spend ranking', () => {
    expect(selectAssistantPlanHeuristic('chi ha speso di più in pedaggi?')).toEqual({
      action: 'tool_call',
      toolName: 'rankVehicleCosts',
      arguments: { rankMetric: 'spend', rankDirection: 'top', costSource: 'TOLLS' }
    });
  });

  it('routes "classifica per consumo medio" to fuel efficiency ranking', () => {
    expect(selectAssistantPlanHeuristic('classifica camion per consumo medio')).toEqual({
      action: 'tool_call',
      toolName: 'rankFuelEfficiency',
      arguments: { rankMetric: 'consumption', rankDirection: 'top' }
    });
  });

  it('routes "spendono piu carburante per km" to cost-per-km ranking', () => {
    expect(selectAssistantPlanHeuristic('quali camion spendono più carburante per km?')).toEqual({
      action: 'tool_call',
      toolName: 'rankFuelEfficiency',
      arguments: { rankMetric: 'costPerKm', rankDirection: 'top' }
    });
  });

  it('routes "consumi anomali" to the anomaly analyzer', () => {
    expect(selectAssistantPlanHeuristic('quali mezzi hanno consumi anomali?')).toEqual({
      action: 'tool_call',
      toolName: 'analyzeFuelAnomalies',
      arguments: { rankMetric: 'consumption' }
    });
  });

  it('routes a two-plate comparison over six months to compareVehicleCosts', () => {
    expect(selectAssistantPlanHeuristic('confronta ZZ101ZZ e ZZ103ZZ negli ultimi 6 mesi')).toEqual({
      action: 'tool_call',
      toolName: 'compareVehicleCosts',
      arguments: { plates: ['ZZ101ZZ', 'ZZ103ZZ'], withinDays: 180 }
    });
  });

  it('routes "chi e peggiorato rispetto al mese precedente" to the cost trend', () => {
    expect(selectAssistantPlanHeuristic('chi è peggiorato rispetto al mese precedente?')).toEqual({
      action: 'tool_call',
      toolName: 'getVehicleCostTrend',
      arguments: { rankDirection: 'top', withinDays: 30 }
    });
  });

  it('does not hijack a plain single-plate fuel search', () => {
    expect(selectAssistantPlanHeuristic('rifornimenti FuelCo per ZZ101ZZ')).toEqual({
      action: 'tool_call',
      toolName: 'searchFuelEntries',
      arguments: { plate: 'ZZ101ZZ', fuelSupplierName: 'FuelCo' }
    });
  });

  it('routes "riepilogo rifornimenti" to the fuel summary (accented suffix matched)', () => {
    expect(selectAssistantPlanHeuristic('riepilogo rifornimenti')).toEqual({
      action: 'tool_call',
      toolName: 'getFuelSummary',
      arguments: {}
    });
  });
});
