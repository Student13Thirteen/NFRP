import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { RecoverableForm } from '@/components/RecoverableForm';
import { RoadFineFields } from '@/components/RoadEventForms';
import { prisma } from '@/lib/db';
import { createRoadFineAction } from '../actions';

type Props = { searchParams: Promise<{ error?: string }> };
export default async function NewRoadFinePage({ searchParams }: Props) {
  await requireUser();
  const params = await searchParams;
  const [tractors, trailers, drivers] = await Promise.all([
    prisma.tractor.findMany({ where: { active: true }, orderBy: { plate: 'asc' }, select: { id: true, plate: true, brand: true, model: true } }),
    prisma.trailer.findMany({ where: { active: true }, orderBy: { plate: 'asc' }, select: { id: true, plate: true, brand: true, model: true } }),
    prisma.driver.findMany({ where: { active: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], select: { id: true, firstName: true, lastName: true } })
  ]);
  return <>
    <PageHeader title="Inserisci verbale" description="Registra infrazione, scadenze, responsabilità, pagamento e documenti senza contabilizzare importi non pagati." action={<Link className="secondary-button" href="/fines"><ArrowLeft size={16} aria-hidden />Torna ai verbali</Link>} />
    <section className="panel">
      {params.error ? <p className="form-error">{params.error}</p> : null}
      <RecoverableForm action={createRoadFineAction} className="form-stack" recoveryKey="fine:new" recoverOnError={Boolean(params.error)}>
        <RoadFineFields
          tractors={tractors.map((item) => ({ id: item.id, label: [item.plate, item.brand, item.model].filter(Boolean).join(' · ') }))}
          trailers={trailers.map((item) => ({ id: item.id, label: [item.plate, item.brand, item.model].filter(Boolean).join(' · ') }))}
          drivers={drivers.map((item) => ({ id: item.id, label: `${item.lastName} ${item.firstName}` }))}
          showInitialFiles
        />
        <button className="primary-button" type="submit"><Save size={16} aria-hidden />Salva verbale</button>
      </RecoverableForm>
    </section>
  </>;
}
