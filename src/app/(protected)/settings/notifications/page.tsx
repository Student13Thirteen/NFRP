import { requireUser } from '@/lib/auth';
import { Send } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { getOptionalEnv } from '@/lib/env';
import { isTelegramConfigured } from '@/lib/telegram';
import { testTelegramAction } from './actions';

export default async function NotificationsSettingsPage() {
  await requireUser();
  const telegram = isTelegramConfigured();
  const lastTest = await prisma.notificationLog.findFirst({
    where: { type: 'TEST', channel: 'TELEGRAM' },
    orderBy: { sentAt: 'desc' }
  });

  return (
    <>
      <PageHeader title="Notifiche" description="Configurazione Telegram e test invio." />
      <div className="grid two">
        <section className="detail-section">
          <h2>Telegram</h2>
          <dl className="detail-list">
            <div>
              <dt>Stato</dt>
              <dd>{telegram.enabled ? 'Attivo' : 'Disattivato'}</dd>
            </div>
            <div>
              <dt>Bot token</dt>
              <dd>{telegram.hasToken ? 'Configurato' : 'Non configurato'}</dd>
            </div>
            <div>
              <dt>Chat ID</dt>
              <dd>{telegram.chatIds.length > 0 ? telegram.chatIds.join(', ') : 'Nessun chat_id'}</dd>
            </div>
            <div>
              <dt>URL pubblico</dt>
              <dd>{getOptionalEnv('APP_PUBLIC_URL', 'http://localhost:3000')}</dd>
            </div>
          </dl>
          <form action={testTelegramAction} style={{ marginTop: 16 }}>
            <button className="primary-button" type="submit">
              <Send size={16} aria-hidden />
              Invia notifica di test
            </button>
          </form>
        </section>
        <section className="detail-section">
          <h2>Ultimo test</h2>
          {lastTest ? (
            <dl className="detail-list">
              <div>
                <dt>Data</dt>
                <dd>{formatDate(lastTest.sentAt)}</dd>
              </div>
              <div>
                <dt>Esito</dt>
                <dd>{lastTest.success ? 'OK' : 'Errore'}</dd>
              </div>
              <div>
                <dt>Dettaglio</dt>
                <dd>{lastTest.error || '-'}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted">Nessun test eseguito.</p>
          )}
        </section>
      </div>
    </>
  );
}
