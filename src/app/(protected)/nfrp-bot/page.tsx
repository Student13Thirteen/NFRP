import { requireUser } from '@/lib/auth';
import { AssistantChatPanel } from '@/components/AssistantChatWidget';
import { PageHeader } from '@/components/PageHeader';
import { getAssistantEnabled } from '@/lib/env';

export default async function NFRPBotPage() {
  await requireUser();
  const assistantEnabled = getAssistantEnabled();

  return (
    <div className="assistant-page">
      <PageHeader title="NFRP Bot" description="Chat documenti, targhe, scadenze e PDF mancanti." />

      {assistantEnabled ? (
        <AssistantChatPanel mode="page" />
      ) : (
        <section className="panel assistant-disabled-panel">
          <strong>NFRP Bot non abilitato</strong>
          <span>Imposta ASSISTANT_ENABLED=true per usare la chat.</span>
        </section>
      )}
    </div>
  );
}
