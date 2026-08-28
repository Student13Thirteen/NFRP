import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowRight, FilePlus2, Filter, UploadCloud } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { PageSizeField } from '@/components/PageSizeField';
import { TablePagination } from '@/components/TablePagination';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { formatRoadEventMoney, getRoadEventVehicleLabel, getRoadFineStatusLabel, roadFineInclude } from '@/lib/road-events';
import { paginateItems } from '@/lib/pagination';

type Props = { searchParams: Promise<{ q?: string; status?: string; page?: string; pageSize?: string }> };
export default async function RoadFinesPage({ searchParams }: Props) {
  await requireUser();
  const params = await searchParams;
  const all = await prisma.roadFine.findMany({ include: roadFineInclude, orderBy: [{ violationDate: 'desc' }, { createdAt: 'desc' }] });
  const query = (params.q || '').trim().toLocaleLowerCase('it-IT');
  const allowed = ['TO_REVIEW', 'TO_PAY', 'CONTESTED', 'PAID', 'CANCELLED', 'CLOSED'];
  const status = allowed.includes(params.status || '') ? params.status || '' : '';
  const rows = all.filter((item) => (!status || item.status === status) && (!query || [item.noticeNumber, item.authority, item.location, item.violationCode, item.description, item.tractor?.plate, item.trailer?.plate, item.driver ? `${item.driver.lastName} ${item.driver.firstName}` : ''].filter(Boolean).join(' ').toLocaleLowerCase('it-IT').includes(query)));
  const pagination = paginateItems(rows, params.page, params.pageSize);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const open = all.filter((item) => !['PAID', 'CANCELLED', 'CLOSED'].includes(item.status));
  const overdue = open.filter((item) => item.paymentDueDate && item.paymentDueDate < today).length;
  const paid = all.filter((item) => ['PAID', 'CLOSED'].includes(item.status)).reduce((sum, item) => sum + (item.paidAmountCents || 0), 0);
  return <>
    <PageHeader title="Verbali" description="Infrazioni, responsabilità, ricorsi, scadenze e pagamenti collegati a mezzi e autisti." action={<div className="actions-row"><Link className="secondary-button" href="/fines/import"><UploadCloud size={16} aria-hidden />Acquisisci da PDF</Link><Link className="primary-button" href="/fines/new"><FilePlus2 size={16} aria-hidden />Inserisci manualmente</Link></div>} />
    <section className="metrics" aria-label="Riepilogo verbali">
      <div className="metric"><span>Verbali aperti</span><strong>{open.length}</strong></div>
      <div className="metric"><span>Pagamenti scaduti</span><strong>{overdue}</strong></div>
      <div className="metric"><span>Contestati</span><strong>{all.filter((item) => item.status === 'CONTESTED').length}</strong></div>
      <div className="metric"><span>Pagato registrato</span><strong>{formatRoadEventMoney(paid)}</strong></div>
    </section>
    <form className="filter-bar" action="/fines">
      <PageSizeField pageSize={params.pageSize} />
      <label>Cerca<input name="q" defaultValue={params.q || ''} placeholder="Numero, autorità, luogo, targa, autista" /></label>
      <label>Stato<select name="status" defaultValue={status}><option value="">Tutti</option>{allowed.map((value) => <option key={value} value={value}>{getRoadFineStatusLabel(value)}</option>)}</select></label>
      <div className="filter-actions"><button className="primary-button" type="submit"><Filter size={15} aria-hidden />Filtra</button><Link className="secondary-button" href="/fines">Reset</Link><span className="filter-count">{rows.length} risultati</span></div>
    </form>
    <section className="table-wrap"><table><thead><tr><th>Data</th><th>Verbale</th><th>Mezzo / autista</th><th>Scadenza</th><th>Importo</th><th>Stato</th><th></th></tr></thead><tbody>
      {pagination.items.length === 0 ? <tr><td colSpan={7} className="empty-state">Nessun verbale trovato.</td></tr> : pagination.items.map((item) => <tr key={item.id}>
        <td>{formatDate(item.violationDate)}</td><td><Link className="table-cell-link" href={`/fines/${item.id}`}><strong>{item.noticeNumber || item.authority}</strong></Link><br/><span className="muted">{item.location}</span></td>
        <td>{getRoadEventVehicleLabel(item)}{item.driver ? <><br/><span className="muted">{item.driver.lastName} {item.driver.firstName}</span></> : null}</td>
        <td>{item.paymentDueDate ? formatDate(item.paymentDueDate) : '-'}</td><td>{formatRoadEventMoney(item.paidAmountCents ?? item.reducedAmountCents ?? item.standardAmountCents)}</td>
        <td><span className={`badge ${item.status === 'PAID' || item.status === 'CLOSED' ? 'fuel-status-ok' : item.status === 'CANCELLED' ? 'fuel-status-verified' : 'fuel-status-review'}`}>{getRoadFineStatusLabel(item.status)}</span></td>
        <td><Link className="table-cell-link" href={`/fines/${item.id}`}>Apri <ArrowRight size={14} aria-hidden /></Link></td>
      </tr>)}</tbody></table></section>
    <TablePagination currentPage={pagination.currentPage} from={pagination.from} pathname="/fines" searchParams={params} to={pagination.to} totalItems={pagination.totalItems} totalPages={pagination.totalPages} />
  </>;
}
