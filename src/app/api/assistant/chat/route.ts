import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { getAssistantEnabled } from '@/lib/env';
import { planWithOllama, OllamaModelUnavailableError, OllamaUnavailableError } from '@/lib/ollama';
import { selectAssistantPlanHeuristic } from '@/lib/assistant-planner';
import { runAssistantTool, type AssistantToolResult } from '@/lib/assistant-tools';

const requestSchema = z.object({
  message: z.string().trim().min(2).max(1000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().max(1200)
      })
    )
    .max(8)
    .optional()
});

function createAssistantReply(result: AssistantToolResult): string {
  if (result.total === 0) return result.message;
  const rowsLabel = result.rows.length === 1 ? '1 riga' : `${result.rows.length} righe`;
  return result.tooMany ? `${result.message} In chat trovi ${rowsLabel}; apri la vista filtrata per il resto.` : result.message;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Non autorizzato.' }, { status: 401 });
  }

  if (!getAssistantEnabled()) {
    return NextResponse.json({ error: 'NFRP Bot non abilitato. Imposta ASSISTANT_ENABLED=true.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Scrivi una domanda breve sui documenti o sulle scadenze.' }, { status: 400 });
  }

  try {
    const heuristicPlan = selectAssistantPlanHeuristic(parsed.data.message);
    let plan = heuristicPlan;
    let model = 'regole-locali';

    if (heuristicPlan.action === 'clarify') {
      try {
        const ollamaPlan = await planWithOllama(parsed.data.message, parsed.data.history || []);
        plan = ollamaPlan.plan || heuristicPlan;
        model = ollamaPlan.model;
      } catch (error) {
        console.warn('Assistant LLM planner unavailable, using local clarification.', error);
      }
    }

    if (!plan) {
      return NextResponse.json({
        reply: 'Non ho capito in modo sicuro la richiesta. Puoi indicare targa, tipo documento, scadenza o PDF mancanti?',
        rows: [],
        model
      });
    }

    if (plan.action === 'clarify') {
      return NextResponse.json({
        reply: plan.question,
        rows: [],
        model
      });
    }

    const result = await runAssistantTool(plan.toolName, plan.arguments);

    return NextResponse.json({
      reply: createAssistantReply(result),
      rows: result.rows,
      link: result.link,
      total: result.total,
      tooMany: result.tooMany,
      toolName: plan.toolName,
      model
    });
  } catch (error) {
    console.error('Assistant chat failed.', error);

    if (error instanceof OllamaModelUnavailableError) {
      return NextResponse.json(
        {
          error: `Il modello ${error.model} non e disponibile in Ollama. Scaricalo oppure configura OLLAMA_MODEL.`
        },
        { status: 503 }
      );
    }

    if (error instanceof OllamaUnavailableError || error instanceof TypeError) {
      return NextResponse.json(
        {
          error: 'NFRP Bot non riesce a contattare Ollama. Controlla che il servizio ollama sia avviato.'
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: 'NFRP Bot non disponibile in questo momento.' }, { status: 500 });
  }
}
