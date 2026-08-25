import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowRight, CarFront, Filter } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { PageSizeField } from '@/components/PageSizeField';
import { TablePagination } from '@/components/TablePagination';
import { formatDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { formatRoadEventMoney, getRoadAccidentStatusLabel, getRoadEventVehicleLabel, roadAccidentInclude } from '@/lib/road-events';
import { paginateItems } from '@/lib/pagination';

type Props = { searchParams: Promise<{ q?: string; status?: string; page?: string; pageSize?: string }> };
export default async function RoadAccidentsPage({ searchParams }: Props) {
  await requireUser();
  const params = await searchParams;
  const all = await prisma.roadAccident.findMany({ include: roadAccidentInclude, orderBy: [{ accidentDate: 'desc' }, { createdAt: 'desc' }] });
  const query = (params.q || '').trim().toLocaleLowerCase('it-IT');
  const allowed = ['REPORTED', 'DOCUMENTS_PENDING', 'CLAIM_OPEN', 'ASSESSMENT', 'REPAIR', 'SETTLEMENT_PENDING', 'CLOSED', 'CANCELLED'];
  const status = allowed.includes(params.status || '') ? params.status || '' : '';
  const rows = all.filter((item) => (!status || item.status === status) && (!query || [item.claimNumber, item.insurerName, item.location, item.description, item.tractor?.plate, item.trailer?.plate, item.driver ? `${item.driver.lastName} ${item.driver.firstName}` : ''].filter(Boolean).join(' ').toLocaleLowerCase('it-IT').includes(query)));
  const pagination = paginateItems(rows, params.page, params.pageSize);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const open = all.filter((item) => !['CLOSED', 'CANCELLED'].includes(item.status));
  const overdue = open.filter((item) => item.nextDeadline && item.nextDeadline < today).length;
  const directCosts = all.filter((item) => item.status !== 'CANCELLED').reduce((sum, item) => sum + (item.directCostCents || 0), 0);
  const reimbursements = all.filter((item) => item.status !== 'CANCELLED').reduce((sum, item) => sum + (item.reimbursementCents || 0), 0);
  return <>
    <PageHeader title="Sinistri stradali" description="Segnalazioni, pratiche assicurative, scadenze, danni, riparazioni e rimborsi." action={<Link className="primary-button" href="/road-accidents/new"><CarFront size={16} aria-hidden />Inserisci sinistro</Link>} />
    <section className="metrics" aria-label="Riepilogo sinistri">
      <div className="metric"><span>Pratiche aperte</span><strong>{open.length}</strong></div><div className="metric"><span>Scadenze superate</span><strong>{overdue}</strong></div><div className="metric"><span>Costi diretti</span><strong>{formatRoadEventMoney(directCosts)}</strong></div><div className="metric"><span>Rimborsi</span><strong>{formatRoadEventMoney(reimbursements)}</strong></div>
    </section>
    <form className="filter-bar" action="/road-accidents"><PageSizeField pageSize={params.pageSize} /><label>Cerca<input name="q" defaultValue={params.q || ''} placeholder="Pratica, compagnia, luogo, targa, autista" /></label><label>Stato<select name="status" defaultValue={status}><option value="">Tutti</option>{allowed.map((value) => <option key={value} value={value}>{getRoadAccidentStatusLabel(value)}</option>)}</select></label><div className="filter-actions"><button className="primary-button" type="submit"><Filter size={15} aria-hidden />Filtra</button><Link className="secondary-button" href="/road-accidents">Reset</Link><span className="filter-count">{rows.length} risultati</span></div></form>
    <section className="table-wrap"><table><thead><tr><th>Data</th><th>Pratica</th><th>Mezzo / autista</th><th>Prossima scadenza</th><th>Saldo diretto</th><th>Stato</th><th></th></tr></thead><tbody>{pagination.items.length === 0 ? <tr><td colSpan={7} className="empty-state">Nessun sinistro stradale trovato.</td></tr> : pagination.items.map((item) => <tr key={item.id}>
      <td>{formatDate(item.accidentDate)}</td><td><Link className="table-cell-link" href={`/road-accidents/${item.id}`}><strong>{item.claimNumber || item.location}</strong></Link><br/><span className="muted">{item.insurerName || item.location}</span></td><td>{getRoadEventVehicleLabel(item)}{item.driver ? <><br/><span className="muted">{item.driver.lastName} {item.driver.firstName}</span></> : null}</td><td>{item.nextDeadline ? formatDate(item.nextDeadline) : '-'}</td><td>{formatRoadEventMoney((item.directCostCents || 0) - (item.reimbursementCents || 0))}</td><td><span className={`badge ${item.status === 'CLOSED' ? 'fuel-status-ok' : item.status === 'CANCELLED' ? 'fuel-status-verified' : 'fuel-status-review'}`}>{getRoadAccidentStatusLabel(item.status)}</span></td><td><Link className="table-cell-link" href={`/road-accidents/${item.id}`}>Apri <ArrowRight size={14} aria-hidden /></Link></td></tr>
    )}</tbody></table></section>
    <TablePagination currentPage={pagination.currentPage} from={pagination.from} pathname="/road-accidents" searchParams={params} to={pagination.to} totalItems={pagination.totalItems} totalPages={pagination.totalPages} />
  </>;
}
