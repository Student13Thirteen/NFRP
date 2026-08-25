import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowLeft, Download, Paperclip, Save, Trash2 } from 'lucide-react';
import { notFound } from 'next/navigation';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { PageHeader } from '@/components/PageHeader';
import { RoadEventFileUpload } from '@/components/RoadEventFileUpload';
import { RoadFineFields } from '@/components/RoadEventForms';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { getRoadEventAttachmentKindLabel, ROAD_EVENT_ATTACHMENT_KINDS, roadFineInclude } from '@/lib/road-events';
import { addRoadFineAttachmentsAction, deleteRoadFineAction, deleteRoadFineAttachmentAction, updateRoadFineAction } from '../actions';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> };
const formatHistoryDate = (value: Date) => new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Rome' }).format(value);
export default async function RoadFineDetailPage({ params, searchParams }: Props) {
  await requireUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [fine, tractors, trailers, drivers] = await Promise.all([
    prisma.roadFine.findUnique({ where: { id }, include: roadFineInclude }),
    prisma.tractor.findMany({ where: { active: true }, orderBy: { plate: 'asc' }, select: { id: true, plate: true, brand: true, model: true } }),
    prisma.trailer.findMany({ where: { active: true }, orderBy: { plate: 'asc' }, select: { id: true, plate: true, brand: true, model: true } }),
    prisma.driver.findMany({ where: { active: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], select: { id: true, firstName: true, lastName: true } })
  ]);
  if (!fine) notFound();
  return <>
    <PageHeader title={`Verbale ${fine.noticeNumber || fine.authority}`} description={`${formatDate(fine.violationDate)} · ${fine.location}`} action={<Link className="secondary-button" href="/fines"><ArrowLeft size={16} aria-hidden />Torna ai verbali</Link>} />
    {query.error ? <p className="form-error">{query.error}</p> : null}
    <section className="panel">
      <form action={updateRoadFineAction.bind(null, fine.id)} className="form-stack">
        <input name="expectedUpdatedAt" type="hidden" value={fine.updatedAt.toISOString()} />
        <RoadFineFields fine={fine} tractors={tractors.map((item) => ({ id: item.id, label: [item.plate, item.brand, item.model].filter(Boolean).join(' · ') }))} trailers={trailers.map((item) => ({ id: item.id, label: [item.plate, item.brand, item.model].filter(Boolean).join(' · ') }))} drivers={drivers.map((item) => ({ id: item.id, label: `${item.lastName} ${item.firstName}` }))} />
        <button className="primary-button" type="submit"><Save size={16} aria-hidden />Salva modifiche</button>
      </form>
    </section>

    <section className="detail-section" style={{ marginTop: 18 }}><h2>Allegati</h2>
      {fine.attachments.length === 0 ? <p className="empty-state">Nessun allegato presente.</p> : <div className="table-wrap"><table><thead><tr><th>Tipo</th><th>File</th><th>Caricato</th><th></th></tr></thead><tbody>{fine.attachments.map((item) => <tr key={item.id}><td>{getRoadEventAttachmentKindLabel(item.kind)}</td><td><Link className="table-cell-link" href={`/api/road-event-attachments/${item.id}/file`} target="_blank"><Download size={14} aria-hidden />{item.originalFileName}</Link></td><td>{formatDate(item.createdAt)}</td><td><form action={deleteRoadFineAttachmentAction.bind(null, item.id)}><ConfirmSubmitButton className="icon-button" message="Eliminare definitivamente questo allegato?" title="Elimina allegato"><Trash2 size={15} aria-hidden /></ConfirmSubmitButton></form></td></tr>)}</tbody></table></div>}
      <form action={addRoadFineAttachmentsAction.bind(null, fine.id)} className="form-stack" style={{ marginTop: 16 }}>
        <div className="form-grid"><label>Tipo allegato<select name="attachmentKind" defaultValue="OTHER">{ROAD_EVENT_ATTACHMENT_KINDS.map((kind) => <option key={kind} value={kind}>{getRoadEventAttachmentKindLabel(kind)}</option>)}</select></label><RoadEventFileUpload label="Nuovi allegati" required /></div>
        <button className="secondary-button" type="submit"><Paperclip size={16} aria-hidden />Aggiungi allegati</button>
      </form>
    </section>

    <section className="detail-section" style={{ marginTop: 18 }}><h2>Storico modifiche</h2>{fine.revisions.length === 0 ? <p className="empty-state">Nessuna modifica registrata.</p> : <div className="timeline-list">{fine.revisions.map((item) => <article key={item.id}><strong>{item.summary}</strong><span>{formatHistoryDate(item.createdAt)}</span></article>)}</div>}</section>
    {fine.status === 'TO_REVIEW' ? <section className="danger-zone"><h2>Elimina prima registrazione</h2><p>Disponibile soltanto finché il verbale è da controllare. Negli altri stati usa Annullato o Chiuso per conservarne la traccia.</p><form action={deleteRoadFineAction.bind(null, fine.id)}><ConfirmSubmitButton className="danger-button" message="Eliminare il verbale e tutti i suoi allegati?"><Trash2 size={16} aria-hidden />Elimina verbale</ConfirmSubmitButton></form></section> : null}
  </>;
}
