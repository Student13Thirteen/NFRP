'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FormEvent, useMemo, useRef, useState } from 'react';
import { Bot, ExternalLink, Loader2, MessageCircle, Send, X } from 'lucide-react';

type AssistantRow = {
  id?: string;
  title: string;
  entityLabel: string;
  entityTypeLabel: string;
  documentTypeName: string;
  expiryDate: string;
  daysUntil: number | null;
  statusLabel: string;
  pdfLabel: string;
  href?: string;
  resultType?: 'document' | 'trip' | 'fuel' | 'maintenance' | 'warehouse' | 'summary';
  typeLabel?: string;
  dateLabel?: string;
  dateValue?: string;
  metricLabel?: string;
  metricValue?: string;
};

type AssistantLink = {
  href: string;
  label: string;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  rows?: AssistantRow[];
  link?: AssistantLink;
  error?: boolean;
};

type AssistantChatResponse = {
  reply?: string;
  rows?: AssistantRow[];
  link?: AssistantLink;
  error?: string;
};

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function RowLink({ row }: { row: AssistantRow }) {
  if (!row.href) return <span>{row.title}</span>;
  return (
    <Link href={row.href}>
      {row.title}
      <ExternalLink size={13} aria-hidden />
    </Link>
  );
}

type AssistantChatPanelProps = {
  mode?: 'widget' | 'page';
  onClose?: () => void;
};

export function AssistantChatPanel({ mode = 'widget', onClose }: AssistantChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Sono NFRP Bot. Posso controllare documenti, viaggi, rifornimenti, manutenzioni e magazzino.'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const history = useMemo(
    () =>
      messages
        .filter((message) => !message.error)
        .slice(-8)
        .map((message) => ({
          role: message.role,
          content: message.content
        })),
    [messages]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const userMessage: ChatMessage = { id: createMessageId(), role: 'user', content: text };
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history })
      });
      const payload = (await response.json().catch(() => null)) as AssistantChatResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error || 'NFRP Bot non disponibile.');
      }

      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: 'assistant',
          content: payload?.reply || 'Nessuna risposta disponibile.',
          rows: payload?.rows || [],
          link: payload?.link
        }
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: 'assistant',
          content: error instanceof Error ? error.message : 'NFRP Bot non disponibile.',
          error: true
        }
      ]);
    } finally {
      setIsLoading(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  return (
    <section className={`assistant-panel ${mode === 'page' ? 'assistant-panel-page' : ''}`} aria-label="NFRP Bot documenti, viaggi, rifornimenti, manutenzioni e magazzino">
      <header className="assistant-header">
        <div>
          <Bot size={18} aria-hidden />
          <strong>NFRP Bot</strong>
        </div>
        {onClose ? (
          <button className="assistant-icon-button" type="button" onClick={onClose} aria-label="Chiudi NFRP Bot">
            <X size={18} aria-hidden />
          </button>
        ) : null}
      </header>

      <div className="assistant-messages" aria-live="polite">
        {messages.map((message) => (
          <article className={`assistant-message ${message.role} ${message.error ? 'error' : ''}`} key={message.id}>
            <p>{message.content}</p>
            {message.rows?.length ? (
              <div className="assistant-results">
                {message.rows.map((row, index) => (
                  <div className="assistant-result" key={row.id || `${row.title}-${index}`}>
                    <strong>
                      <RowLink row={row} />
                    </strong>
                    <dl>
                      <div>
                        <dt>Entita</dt>
                        <dd>{row.entityLabel}</dd>
                      </div>
                      <div>
                        <dt>{row.typeLabel || 'Tipo'}</dt>
                        <dd>{row.documentTypeName}</dd>
                      </div>
                      <div>
                        <dt>{row.dateLabel || 'Scadenza'}</dt>
                        <dd>
                          {row.dateValue || row.expiryDate}
                          {row.daysUntil !== null ? ` (${row.daysUntil} giorni)` : ''}
                        </dd>
                      </div>
                      <div>
                        <dt>Stato</dt>
                        <dd>{row.statusLabel}</dd>
                      </div>
                      <div>
                        <dt>{row.metricLabel || 'PDF'}</dt>
                        <dd>{row.metricValue || row.pdfLabel}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            ) : null}
            {message.link ? (
              <Link className="assistant-link" href={message.link.href}>
                {message.link.label}
                <ExternalLink size={13} aria-hidden />
              </Link>
            ) : null}
          </article>
        ))}
        {isLoading ? (
          <div className="assistant-message assistant">
            <p className="assistant-loading">
              <Loader2 size={15} aria-hidden />
              Sto controllando...
            </p>
          </div>
        ) : null}
      </div>

      <form className="assistant-form" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Scrivi una domanda..."
          rows={2}
        />
        <button className="assistant-send" type="submit" disabled={!input.trim() || isLoading} aria-label="Invia domanda">
          <Send size={17} aria-hidden />
        </button>
      </form>
    </section>
  );
}

export function AssistantChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  if (pathname === '/nfrp-bot') return null;

  return (
    <div className={`assistant-widget ${isOpen ? 'is-open' : ''}`}>
      {isOpen ? (
        <AssistantChatPanel onClose={() => setIsOpen(false)} />
      ) : (
        <button className="assistant-launcher" type="button" onClick={() => setIsOpen(true)} aria-label="Apri NFRP Bot">
          <MessageCircle size={22} aria-hidden />
        </button>
      )}
    </div>
  );
}
