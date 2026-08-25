import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowLeft, Download, Paperclip, Save, Trash2, Wrench } from 'lucide-react';
import { notFound } from 'next/navigation';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { PageHeader } from '@/components/PageHeader';
import { RoadEventFileUpload } from '@/components/RoadEventFileUpload';
import { RoadAccidentFields } from '@/components/RoadEventForms';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { formatRoadEventMoney, getRoadEventAttachmentKindLabel, ROAD_EVENT_ATTACHMENT_KINDS, roadAccidentInclude } from '@/lib/road-events';
import { addRoadAccidentAttachmentsAction, deleteRoadAccidentAction, deleteRoadAccidentAttachmentAction, updateRoadAccidentAction } from '../actions';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> };
const formatHistoryDate = (value: Date) => new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Rome' }).format(value);
export default async function RoadAccidentDetailPage({ params, searchParams }: Props) {
  await requireUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [accident, tractors, trailers, drivers] = await Promise.all([
    prisma.roadAccident.findUnique({ where: { id }, include: roadAccidentInclude }),
    prisma.tractor.findMany({ where: { active: true }, orderBy: { plate: 'asc' }, select: { id: true, plate: true, brand: true, model: true } }),
    prisma.trailer.findMany({ where: { active: true }, orderBy: { plate: 'asc' }, select: { id: true, plate: true, brand: true, model: true } }),
    prisma.driver.findMany({ where: { active: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], select: { id: true, firstName: true, lastName: true } })
  ]);
  if (!accident) notFound();
  return <>
    <PageHeader title={`Sinistro ${accident.claimNumber || formatDate(accident.accidentDate)}`} description={`${accident.location}${accident.insurerName ? ` · ${accident.insurerName}` : ''}`} action={<div className="actions-row"><Link className="secondary-button" href="/road-accidents"><ArrowLeft size={16} aria-hidden />Torna ai sinistri stradali</Link><Link className="primary-button" href={`/maintenances/new?roadAccidentId=${accident.id}`}><Wrench size={16} aria-hidden />Registra manutenzione collegata</Link></div>} />
    {query.error ? <p className="form-error">{query.error}</p> : null}
    <section className="panel"><form action={updateRoadAccidentAction.bind(null, accident.id)} className="form-stack"><input name="expectedUpdatedAt" type="hidden" value={accident.updatedAt.toISOString()} /><RoadAccidentFields accident={accident} tractors={tractors.map((item) => ({ id: item.id, label: [item.plate, item.brand, item.model].filter(Boolean).join(' · ') }))} trailers={trailers.map((item) => ({ id: item.id, label: [item.plate, item.brand, item.model].filter(Boolean).join(' · ') }))} drivers={drivers.map((item) => ({ id: item.id, label: `${item.lastName} ${item.firstName}` }))} /><button className="primary-button" type="submit"><Save size={16} aria-hidden />Salva modifiche</button></form></section>

    <section className="detail-section" style={{ marginTop: 18 }}><h2>Manutenzioni collegate</h2><p className="muted">Le fatture collegate restano la fonte contabile della riparazione e non vengono duplicate nel costo diretto del sinistro.</p>{accident.expenseDocuments.length === 0 ? <p className="empty-state">Nessuna manutenzione collegata.</p> : <div className="table-wrap"><table><thead><tr><th>Data</th><th>Documento</th><th>Importo</th><th>Stato</th><th></th></tr></thead><tbody>{accident.expenseDocuments.map((item) => <tr key={item.id}><td>{formatDate(item.documentDate || item.registeredAt)}</td><td>{item.documentNumber || 'Manutenzione'}</td><td>{formatRoadEventMoney(item.totalAmountCents)}</td><td>{item.status === 'CONFIRMED' ? 'Confermata' : 'Da controllare'}</td><td><Link className="table-cell-link" href={`/maintenances/expenses/${item.id}`}>Apri</Link></td></tr>)}</tbody></table></div>}</section>

    <section className="detail-section" style={{ marginTop: 18 }}><h2>Allegati</h2>{accident.attachments.length === 0 ? <p className="empty-state">Nessun allegato presente.</p> : <div className="table-wrap"><table><thead><tr><th>Tipo</th><th>File</th><th>Caricato</th><th></th></tr></thead><tbody>{accident.attachments.map((item) => <tr key={item.id}><td>{getRoadEventAttachmentKindLabel(item.kind)}</td><td><Link className="table-cell-link" href={`/api/road-event-attachments/${item.id}/file`} target="_blank"><Download size={14} aria-hidden />{item.originalFileName}</Link></td><td>{formatDate(item.createdAt)}</td><td><form action={deleteRoadAccidentAttachmentAction.bind(null, item.id)}><ConfirmSubmitButton className="icon-button" message="Eliminare definitivamente questo allegato?" title="Elimina allegato"><Trash2 size={15} aria-hidden /></ConfirmSubmitButton></form></td></tr>)}</tbody></table></div>}
      <form action={addRoadAccidentAttachmentsAction.bind(null, accident.id)} className="form-stack" style={{ marginTop: 16 }}><div className="form-grid"><label>Tipo allegato<select name="attachmentKind" defaultValue="OTHER">{ROAD_EVENT_ATTACHMENT_KINDS.map((kind) => <option key={kind} value={kind}>{getRoadEventAttachmentKindLabel(kind)}</option>)}</select></label><RoadEventFileUpload label="Nuovi allegati" required /></div><button className="secondary-button" type="submit"><Paperclip size={16} aria-hidden />Aggiungi allegati</button></form>
    </section>
    <section className="detail-section" style={{ marginTop: 18 }}><h2>Storico modifiche</h2>{accident.revisions.length === 0 ? <p className="empty-state">Nessuna modifica registrata.</p> : <div className="timeline-list">{accident.revisions.map((item) => <article key={item.id}><strong>{item.summary}</strong><span>{formatHistoryDate(item.createdAt)}</span></article>)}</div>}</section>
    {accident.status === 'REPORTED' && accident.expenseDocuments.length === 0 ? <section className="danger-zone"><h2>Elimina prima segnalazione</h2><p>Disponibile soltanto prima dell’avvio della pratica e senza manutenzioni collegate. Negli altri casi usa Annullato.</p><form action={deleteRoadAccidentAction.bind(null, accident.id)}><ConfirmSubmitButton className="danger-button" message="Eliminare il sinistro e tutti i suoi allegati?"><Trash2 size={16} aria-hidden />Elimina sinistro</ConfirmSubmitButton></form></section> : null}
  </>;
}
